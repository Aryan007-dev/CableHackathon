"""Export solved plans for the 3D editor (src/cable/): one JSON per plan.

The editor needs more than the submission: the plan's walls, doors, windows
and every room (bathrooms and stairs too, for labels), not just the cable.
This bundles all of it, in metres with the solver's axes (origin lower-left,
y up); the editor flips y itself.

Usage:  .venv/bin/python export_editor.py [plan ids... | --first N]
        (default: the first 20 solved plans in out/submission/)
Output: ../public/cable-plans/<id>.json and ../public/cable-plans/index.json
"""

import json
import sys
from collections import Counter

import shapely
from shapely.ops import polylabel

from step1 import DATA, OUT, load_plans, plan_scale

DEST = OUT.parent.parent / "public" / "cable-plans"

ROOM_TYPES = ["living", "bedroom", "kitchen", "bathroom", "storage", "stair", "balcony"]
LABELS = {"living": "Living", "bedroom": "Bedroom", "kitchen": "Kitchen", "bathroom": "Bathroom",
          "storage": "Storage", "stair": "Stair", "balcony": "Balcony"}


def polygons(geom):
    """Any shapely geometry -> its non-empty polygons."""
    if geom is None or geom.is_empty:
        return []
    # Parts are repaired one at a time: repairing a whole multipolygon merges
    # parts that touch, i.e. two rooms sharing a wall line would become one.
    if hasattr(geom, "geoms"):
        return [g for part in geom.geoms for g in polygons(part)]
    geom = shapely.make_valid(geom)
    if geom.geom_type == "Polygon":
        return [geom]
    return [g for part in getattr(geom, "geoms", []) for g in polygons(part)]


def ring(coords, scale):
    """Shapely ring -> [[x, y], ...] in metres, without the repeated last point."""
    pts = [[round(x / scale, 3), round(y / scale, 3)] for x, y in coords]
    return pts[:-1] if len(pts) > 1 and pts[0] == pts[-1] else pts


def shape(poly, scale):
    return {"outer": ring(poly.exterior.coords, scale),
            "holes": [ring(h.coords, scale) for h in poly.interiors]}


def export_plan(plan, inp, sub=None, metrics=None, labels=None):
    """The editor's view of a plan: every room, the walls and openings, the
    nodes, and (when solved) each hub's ring. Coordinates in metres.

    sub: the submission, or None for a plan that couldn't be solved (it is
    still drawn, with its nodes). labels: optional {(kind, n): label}
    replacing "Bedroom 2" etc. (rooms drawn in the editor are just "Room n").
    """
    scale = plan_scale(plan)
    inner = shapely.make_valid(plan["inner"])
    hubs_in = sub["hubs"] if sub else []

    # Which hub serves each eligible room, by the input's room ids.
    hub_of = {r: h["hub_id"] for h in hubs_in for r in h["assigned_rooms"]}
    node_of = {n["room_id"]: n for n in inp["nodes"]}

    rooms, counts, seen = [], Counter(), Counter()
    for kind in ROOM_TYPES:
        counts[kind] = len(polygons(plan.get(kind)))
    for kind in ROOM_TYPES:
        for poly in polygons(plan.get(kind)):
            seen[kind] += 1
            label = LABELS[kind] + (f" {seen[kind]}" if counts[kind] > 1 else "")
            label = (labels or {}).get((kind, seen[kind]), label)
            at = polylabel(poly, tolerance=0.5)
            rooms.append({"kind": kind, "label": label, "area_m2": round(poly.area / scale**2, 2),
                          "label_at": [round(at.x / scale, 3), round(at.y / scale, 3)],
                          "shape": shape(poly, scale), "room_id": None, "hub_id": None})

    # Match each input room to a polygon: the one holding its node.
    for rid, node in node_of.items():
        at = shapely.Point(node["x"], node["y"])
        best = min((r for r in rooms if r["room_id"] is None),
                   key=lambda r: shapely.Polygon(r["shape"]["outer"]).distance(at), default=None)
        if best is not None:
            best["room_id"], best["hub_id"] = rid, hub_of.get(rid)

    def shapes_of(key):
        return [shape(p, scale) for p in polygons(plan.get(key))]

    xs = [x for x, _ in ring(inner.envelope.exterior.coords, scale)]
    ys = [y for _, y in ring(inner.envelope.exterior.coords, scale)]
    hubs = [{"hub_id": h["hub_id"], "room_id": h["room_id"],
             "x": h["location"]["x"], "y": h["location"]["y"],
             "assigned_rooms": h["assigned_rooms"],
             "sequence": h["closed_sequence"], "ring_length_m": h["ring_length_m"],
             "ring": ring_of(h)} for h in hubs_in]

    return {
        "plan_id": inp["plan_id"], "units": "m",
        "units_per_metre": scale,
        "wall_depth_m": round(float(plan.get("wall_depth") or 0) / scale, 3),
        "bounds": {"min_x": min(xs), "min_y": min(ys), "max_x": max(xs), "max_y": max(ys)},
        "outline": [shape(p, scale) for p in polygons(inner)],
        "walls": shapes_of("wall"),
        "doors": shapes_of("door"),
        "front_doors": shapes_of("front_door"),
        "windows": shapes_of("window"),
        "rooms": rooms,
        "nodes": [{"node_id": n["node_id"], "room_id": n["room_id"],
                   "x": round(n["x"], 3), "y": round(n["y"], 3)} for n in inp["nodes"]],
        "hubs": hubs,
        "metrics": metrics or {},
    }


def ring_of(hub):
    """A submission hub's legs joined into one closed polyline."""
    path = []
    for seg in hub["route_segments"]:
        path.extend(seg["polyline"] if not path else seg["polyline"][1:])
    return [[round(x, 3), round(y, 3)] for x, y in path]


if __name__ == "__main__":
    args = sys.argv[1:]
    solved = sorted(int(p.stem) for p in (OUT / "submission").glob("*.json"))
    if args[:1] == ["--first"]:
        wanted = solved[: int(args[1])]
    elif args:
        wanted = [int(a) for a in args]
    else:
        wanted = solved[:20]
    missing = [w for w in wanted if w not in solved]
    if missing:
        sys.exit(f"no submission for plan(s) {missing}: run solve.py first")

    by_id = {int(p["id"]): p for p in load_plans(DATA / "ResPlan.pkl", DATA / "split.json")
             if int(p["id"]) in set(wanted)}
    DEST.mkdir(parents=True, exist_ok=True)
    index_path = DEST / "index.json"
    index = {e["plan_id"]: e for e in json.loads(index_path.read_text())} if index_path.exists() else {}

    for pid in wanted:
        sub = json.loads((OUT / "submission" / f"{pid}.json").read_text())
        report = json.loads((OUT / "report" / f"{pid}.json").read_text())
        inp = json.loads((OUT / "input" / f"{pid}.json").read_text())
        data = export_plan(by_id[pid], inp, sub, report.get("metrics"))
        (DEST / f"{pid}.json").write_text(json.dumps(data, separators=(",", ":")))
        m = data["metrics"]
        index[pid] = {"plan_id": pid, "hubs": len(data["hubs"]), "rooms": len(data["rooms"]),
                      "J": m.get("J")}
        print(f"plan {pid}: {len(data['rooms'])} rooms, {len(data['hubs'])} hubs, J {m.get('J')}")

    index_path.write_text(json.dumps(sorted(index.values(), key=lambda e: e["plan_id"]), indent=1))
    print(f"{len(wanted)} plans -> {DEST}")
