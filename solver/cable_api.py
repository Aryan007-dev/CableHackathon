"""The solver as a library: read a dataset file safely, rebuild a plan from
the editor's JSON, and solve straight to the editor's JSON.

Used by solve_file.py (the command line) and, through `solve_file.py --serve`,
by the editor's dev server (scripts/resplan/vitePlugin.ts).

Editor JSON = export_editor.export_plan's output, plus:
  status, reason, warning      "solved" | "infeasible" | "excluded" | "failed"
  checks                       every hard-rule check [{name, passed, detail}]
  problems                     where the crossings and overlaps are
  naive_metrics, hubs[].naive_ring, naive_problems
                               the same hubs and orders with each leg routed
                               on its own (before step 7), for comparison
  submission                   the slide-8 submission
  source                       {"kind": "dataset" | "drawn"}
"""

import io
import json
import math
import pickle
import zipfile
from pathlib import Path

import shapely
from shapely.geometry import LineString, MultiPolygon, Point, Polygon
from shapely.ops import polygonize, unary_union

from export_editor import ROOM_TYPES, export_plan, polygons, ring_of
from io_format import make_input
from resplan_utils import normalize_keys
from solve import Failed, choose, design, prepare, solve_with_hubs
from step1 import eligible_rooms, passage_graph, plan_scale
from validate import TOL_M, validate_submission

# ---------------------------------------------------------------------------
# Reading the dataset file
# ---------------------------------------------------------------------------

# Every class the official ResPlan.pkl refers to (found by scanning its
# opcodes). Unpickling can run any function a pickle names, so anything
# else is refused before it can run.
ALLOWED = {
    ("shapely.io", "from_wkb"), ("shapely.wkb", "loads"), ("shapely.wkb", "_loads"),
    ("numpy", "dtype"), ("numpy._core.multiarray", "scalar"), ("numpy.core.multiarray", "scalar"),
    ("networkx.classes.graph", "Graph"),
    ("networkx.classes.reportviews", "NodeView"), ("networkx.classes.reportviews", "EdgeView"),
    ("networkx.classes.coreviews", "AdjacencyView"),
}


class DatasetError(Exception):
    """A problem with the file that the user can act on."""


class SafeUnpickler(pickle.Unpickler):
    def find_class(self, module, name):
        if (module, name) not in ALLOWED:
            raise DatasetError(f"refusing {module}.{name}: not something the ResPlan file contains")
        return super().find_class(module, name)


def load_dataset(path):
    """(plans, plan id -> split name) from a ResPlan .zip or .pkl."""
    path = Path(path)
    with open(path, "rb") as f:
        magic = f.read(4)
    split_of = {}
    try:
        if magic.startswith(b"PK"):
            with zipfile.ZipFile(path) as z:
                pkls = [i for i in z.infolist() if i.filename.lower().endswith((".pkl", ".pickle"))
                        and not i.filename.startswith("__MACOSX/")]
                if not pkls:
                    raise DatasetError("no .pkl inside the zip")
                for info in z.infolist():
                    if info.filename.lower().endswith("split.json"):
                        split_of = _splits(z.read(info))
                with z.open(max(pkls, key=lambda i: i.file_size)) as f:
                    plans = SafeUnpickler(io.BufferedReader(f)).load()
        elif magic[:1] == b"\x80":
            with open(path, "rb") as f:
                plans = SafeUnpickler(f).load()
            split = path.with_name("split.json")
            if split.exists():
                split_of = _splits(split.read_bytes())
        else:
            raise DatasetError("not a ResPlan .zip or .pkl")
    except (pickle.UnpicklingError, EOFError, zipfile.BadZipFile) as e:
        raise DatasetError(f"could not read the file: {e}") from None
    if not isinstance(plans, list) or not all(isinstance(p, dict) for p in plans):
        raise DatasetError("expected a list of plans")
    for p in plans:
        normalize_keys(p)
        # A few plans store their area as a 1-tuple.
        if isinstance(p.get("area"), tuple):
            p["area"] = p["area"][0] if p["area"] else None
    return plans, split_of


def _splits(raw):
    out = {}
    for name, ids in json.loads(raw).items():
        for i in ids:
            out.setdefault(i, name)
    return out


# ---------------------------------------------------------------------------
# Plans from the editor's JSON
# ---------------------------------------------------------------------------

DRAWN_UNITS_PER_M = 20.0  # close to ResPlan's own scale, so the grid is similar


def _poly(shape, s):
    return shapely.make_valid(Polygon([(x * s, y * s) for x, y in shape["outer"]],
                                      [[(x * s, y * s) for x, y in h] for h in shape.get("holes", [])]))


def _multi(polys):
    parts = [g for p in polys for g in polygons(p)]
    return MultiPolygon(parts) if parts else None


MIN_ROOM_M2 = 0.5  # closed wall loops smaller than this are drawing slips, not rooms


def rooms_from_lines(data):
    """A drawn plan given as wall centre lines -> the same plan with `rooms`
    (every closed loop of walls, any shape) and `walls` (the lines made
    thick). Rooms drawn side by side share a wall line; each face between
    the lines is one room, numbered top-left first."""
    lines = [LineString(seg) for seg in data["wall_lines"] if len(seg) >= 2 and seg[0] != seg[-1]]
    if not lines:
        raise ValueError("Draw some walls first.")
    noded = unary_union(lines)  # splits lines where they meet, so loops close
    faces = [shapely.make_valid(f) for f in polygonize(noded)]
    faces = [f for f in faces if f.area >= MIN_ROOM_M2]
    if not faces:
        raise ValueError("No closed room found: every room's walls must join up into a loop.")
    faces.sort(key=lambda f: (-round(f.centroid.y, 1), round(f.centroid.x, 1)))
    thick = float(data.get("wall_depth_m") or 0.1)
    walls = unary_union([l.buffer(thick / 2, cap_style="square", join_style="mitre") for l in lines])
    shape = lambda p: {"outer": [list(c) for c in p.exterior.coords[:-1]],
                       "holes": [[list(c) for c in h.coords[:-1]] for h in p.interiors]}
    return {**data,
            "rooms": [{"kind": "bedroom", "label": f"Room {i}", "shape": shape(f)}
                      for i, f in enumerate(faces, 1)],
            "walls": [shape(w) for w in polygons(walls)]}


def plan_from_json(data):
    """A ResPlan-style plan dict (canvas units) from editor JSON.

    Takes a solved plan's JSON (to re-solve it, e.g. after a hub drag) or a
    plan drawn in the editor: rooms (kind, label, shape) plus walls, doors,
    windows in metres; `outline` is optional (default: the rooms' union).
    A drawn plan may give `wall_lines` instead of rooms and walls.
    """
    if data.get("wall_lines") and not data.get("rooms"):
        data = rooms_from_lines(data)
    s = float(data.get("units_per_metre") or DRAWN_UNITS_PER_M)
    plan = {"id": data.get("plan_id", 0)}
    for kind in ROOM_TYPES:
        plan[kind] = _multi([_poly(r["shape"], s) for r in data["rooms"] if r["kind"] == kind])
    for key in ("wall", "door", "front_door", "window"):
        plan[key] = _multi([_poly(sh, s) for sh in data.get(key + "s", [])])
    # A door is a gap in the wall. Dataset walls already have their gaps, but
    # rooms drawn side by side in the editor each have a wall on the shared
    # edge and the door sits on only one of them.
    doors = [d for d in (plan["door"], plan["front_door"]) if d is not None]
    if plan["wall"] is not None and doors:
        walls = unary_union([_poly(sh, s) for sh in data.get("walls", [])])  # drawn walls overlap
        plan["wall"] = _multi([walls.difference(unary_union(doors))])
    if data.get("outline"):
        inner = unary_union([_poly(sh, s) for sh in data["outline"]])
    else:
        inner = unary_union([_poly(r["shape"], s) for r in data["rooms"] if r["kind"] != "balcony"])
    plan["inner"] = inner
    plan["area"] = inner.area / s**2
    plan["wall_depth"] = float(data.get("wall_depth_m") or 0.1) * s
    return plan


def input_from_json(plan, data):
    """The input file for a plan whose nodes are already placed (in the JSON).
    Room ids stay as they were, so hubs' assigned rooms still match."""
    scale = plan_scale(plan)
    rooms = eligible_rooms(passage_graph(plan), scale)
    out_rooms, nodes = [], []
    for n in data["nodes"]:
        at = Point(n["x"] * scale, n["y"] * scale)
        room = min(rooms, key=lambda r: r["geometry"].distance(at))
        out_rooms.append({"room_id": n["room_id"], "name": room["id"], "type": room["type"],
                          "area_m2": round(room["area_m2"], 4)})
        nodes.append({k: n[k] for k in ("node_id", "room_id", "x", "y")})
    return {"plan_id": data.get("plan_id", 0), "units": "m", "units_per_metre": scale,
            "rooms": out_rooms, "nodes": nodes}


# ---------------------------------------------------------------------------
# Solving to editor JSON
# ---------------------------------------------------------------------------


def problems(sub, inp):
    """Where the crossings are (points) and where cable runs on top of cable
    (segments), as the scorer counts them (validate.score_submission)."""
    stops = [(n["x"], n["y"]) for n in inp["nodes"]] + \
            [(h["location"]["x"], h["location"]["y"]) for h in sub["hubs"]]
    legs = [LineString(s["polyline"]) for h in sub["hubs"] for s in h["route_segments"]
            if len(s["polyline"]) >= 2]
    crossings, overlaps = [], []
    for i in range(len(legs)):
        for j in range(i + 1, len(legs)):
            for g in getattr(legs[i].intersection(legs[j]), "geoms", [legs[i].intersection(legs[j])]):
                if g.geom_type == "Point":
                    p = (g.x, g.y)
                    if all(math.dist(p, q) > TOL_M for q in stops + crossings):
                        crossings.append(p)
                elif g.geom_type == "LineString" and g.length > TOL_M:
                    overlaps.append([[round(x, 3), round(y, 3)] for x, y in g.coords])
    return {"crossings": [[round(x, 3), round(y, 3)] for x, y in crossings], "overlaps": overlaps}


def solve_to_editor(plan, inp=None, hub_points=None, labels=None, source="dataset"):
    """Solve one plan and return the editor JSON (never raises for a plan
    that can't be solved: the result says why, and still draws the plan).

    hub_points: fix the zoning and the hubs instead of choosing them: a list
    of (assigned room ids, (x, y) in metres), one per hub.
    """
    area = plan.get("area")
    if not isinstance(area, (int, float)) or not area > 0 or plan.get("inner") is None or plan["inner"].is_empty:
        return {"plan_id": int(plan.get("id") or 0), "status": "failed", "source": {"kind": source},
                "reason": "the plan has no building outline or recorded floor area, so its scale is unknown",
                "rooms": [], "nodes": [], "hubs": [], "walls": [], "metrics": {}}
    inp = inp or make_input(plan)
    info = {}
    sub = metrics = naive = None
    status, reason = "solved", None
    try:
        ctx = prepare(plan, inp, info)
        if hub_points:
            name = {r["room_id"]: r["name"] for r in inp["rooms"]}
            zones = [frozenset(name[r] for r in rooms) for rooms, _ in hub_points]
            (metrics, sub), zones, picked = solve_with_hubs(ctx, zones, [p for _, p in hub_points])
        else:
            (metrics, sub), zones, picked = choose(ctx)
        naive = design(ctx, zones, picked, naive=True)
    except Failed as f:
        status, reason = f.status, f.reason

    out = export_plan(plan, inp, sub, metrics, labels)
    out.update(status=status, reason=reason, warning=info.get("warning"), source={"kind": source})
    if sub:
        out["checks"] = [{k: c[k] for k in ("name", "passed", "detail")} for c in validate_submission(plan, inp, sub)]
        out["problems"] = problems(sub, inp)
        out["submission"] = sub
        if naive:
            naive_metrics, naive_sub = naive
            out["naive_metrics"] = naive_metrics
            out["naive_problems"] = problems(naive_sub, inp)
            for hub, h in zip(out["hubs"], naive_sub["hubs"]):
                hub["naive_ring"] = ring_of(h)
    return out


def _snap_notice(out, move):
    """Explain when a dropped hub couldn't stay where it was dropped."""
    hub = next((h for h in out["hubs"] if h["hub_id"] == move["hub_id"]), None)
    if hub is None:
        return None
    off = math.dist((hub["x"], hub["y"]), (move["x"], move["y"]))
    if off < 0.3:
        return None
    rooms = ", ".join(r["label"] for r in out["rooms"] if r["hub_id"] == hub["hub_id"])
    return (f"{hub['hub_id']} can only stand in the rooms it serves ({rooms}), at least 0.5 m from walls "
            f"and clear of nodes, so it went to the nearest such spot, {off:.1f} m from where you dropped it.")


def resolve_json(data, move=None):
    """Re-solve a plan from its editor JSON.
    move: optional {"hub_id", "x", "y"}: that hub goes there (snapped to the
    nearest allowed spot in its zone), every other hub stays put."""
    if data.get("wall_lines") and not data.get("rooms"):
        data = rooms_from_lines(data)
    plan = plan_from_json(data)
    labels = {}
    seen = {}
    for r in data["rooms"]:
        seen[r["kind"]] = seen.get(r["kind"], 0) + 1
        labels[(r["kind"], seen[r["kind"]])] = r["label"]
    source = (data.get("source") or {}).get("kind", "drawn")
    if not data.get("nodes"):
        out = solve_to_editor(plan, labels=labels, source=source)
    else:
        inp = input_from_json(plan, data)
        hub_points = None
        if move and data.get("hubs"):
            # Older files don't list a hub's rooms; the rooms say which hub serves them.
            zone = lambda h: h.get("assigned_rooms") or sorted(
                r["room_id"] for r in data["rooms"] if r.get("hub_id") == h["hub_id"] and r.get("room_id"))
            hub_points = [(zone(h), (move["x"], move["y"]) if h["hub_id"] == move["hub_id"] else (h["x"], h["y"]))
                          for h in data["hubs"]]
        out = solve_to_editor(plan, inp, hub_points, labels, source)
        if move and out.get("hubs"):
            out["notice"] = _snap_notice(out, move)
    if data.get("frame"):
        out["frame"] = data["frame"]  # a drawn plan stays on its drawing
    return out
