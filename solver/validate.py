"""Independent checker: the problem statement's hard rules and cost metrics.

Deliberately imports nothing from the solver: if the solver has a bug, the
validator must not share it. (It does use the dataset's own plan_to_graph.)
It works on the files the organisers' checker sees, the input (rooms + fixed
nodes) and the submission (slide 8 format), and measures against the plan's
original polygons, never the solver's grid. Tolerance is 1 mm, as in the
statement.

Hard rules (slide 3), each reported separately so one report shows every
problem:
  1 coverage   2 capacity   3 zone   4 ring   5 free space   6 hub point
Metrics (slides 6-7): L length, X crossings, O overlap, B bends,
J = L + 5X + O + 0.5B, and the tie-break gap in assigned area between hubs.
"""

import math
from collections import Counter, deque

import networkx as nx
import numpy as np
import shapely
from shapely.geometry import LineString, Point
from shapely.ops import unary_union

from resplan_utils import plan_to_graph

MAX_AREA = 100.0  # m² of eligible rooms per hub
MAX_NODES = 5  # nodes per hub
HUB_CLEARANCE = 0.5  # m from walls
TOL_M = 0.001  # 1 mm
ELIGIBLE = ("living", "bedroom", "kitchen", "storage")
# Rooms thinner than this (canvas units, ~5 cm) are drawing noise, not space.
SLIVER = 1.0
WEIGHTS = {"L": 1.0, "X": 5.0, "O": 1.0, "B": 0.5}


def plan_scale(plan):
    return math.sqrt(plan["inner"].area / plan["area"])


def _connected(G, group):
    """Breadth-first search that only steps between rooms inside `group`."""
    group = set(group)
    start = next(iter(group))
    seen, queue = {start}, deque([start])
    while queue:
        for nxt in G.neighbors(queue.popleft()):
            if nxt in group and nxt not in seen:
                seen.add(nxt)
                queue.append(nxt)
    return seen == group


def check_territories(G, rooms, territories):
    """Coverage, capacity and zone rules. G: passage graph; rooms: eligible rooms
    with area_m2; territories: list of room-id groups. Returns (name, ok, detail)."""
    area = {r["id"]: r["area_m2"] for r in rooms}
    report = []

    empty = [n for n, t in enumerate(territories, 1) if not t]
    report.append(("no empty zone", not empty, f"empty: {empty}" if empty else ""))
    groups = [t for t in territories if t]

    uses = Counter(i for t in groups for i in t)
    missing = sorted(set(area) - set(uses))
    twice = sorted(i for i, n in uses.items() if n > 1)
    unknown = sorted(set(uses) - set(area))
    ok = not (missing or twice or unknown)
    report.append(("coverage: every room in exactly one zone", ok,
                   f"missing {missing}, twice {twice}, not eligible {unknown}" if not ok else ""))

    over = [(n, round(sum(area.get(i, 0) for i in t), 2)) for n, t in enumerate(groups, 1)
            if sum(area.get(i, 0) for i in t) > MAX_AREA + 1e-9]
    report.append(("capacity: <= 100 m² per hub", not over, f"(zone, m²): {over}" if over else ""))

    crowded = [(n, len(t)) for n, t in enumerate(groups, 1) if len(t) > MAX_NODES]
    report.append(("capacity: <= 5 nodes per hub", not crowded, f"(zone, nodes): {crowded}" if crowded else ""))

    split = [n for n, t in enumerate(groups, 1) if not _connected(G, t)]
    report.append(("zone: rooms connected through doors/openings", not split,
                   f"not connected: zone {split}" if split else ""))
    return report


def _blocked(plan):
    """Everything cable may not enter: walls, ALL windows, the entrance, balconies."""
    return [shapely.make_valid(plan[k]) for k in ("wall", "window", "front_door", "balcony")
            if plan.get(k) is not None and not plan[k].is_empty]


def check_route(plan, polyline, tol=None):
    """One cable polyline (canvas units) against the free-space rule (slide 3, rule 5)."""
    if tol is None:
        tol = TOL_M * plan_scale(plan)
    line = LineString(polyline)
    report = []

    diagonal = [i for i, (p, q) in enumerate(zip(polyline, polyline[1:]))
                if abs(p[0] - q[0]) > tol and abs(p[1] - q[1]) > tol]
    report.append(("free space: horizontal/vertical runs only", not diagonal,
                   f"diagonal segment(s) {diagonal}" if diagonal else ""))

    outside = line.difference(shapely.make_valid(plan["inner"])).length
    report.append(("free space: inside the inner boundary", outside <= tol,
                   f"{outside / plan_scale(plan):.3f} m outside" if outside > tol else ""))

    inside = sum(line.intersection(g).length for g in _blocked(plan))
    report.append(("free space: no wall, window, entrance or balcony", inside <= tol,
                   f"{inside / plan_scale(plan):.3f} m inside obstacles" if inside > tol else ""))
    return report


def _living_parts(plan):
    geom = plan.get("living")
    if geom is None or geom.is_empty:
        return []
    return [g for g in getattr(geom, "geoms", [geom]) if g.geom_type == "Polygon" and not g.is_empty]


def passage_graph(plan, node_points):
    """The validator's own graph: rooms linked only by passages a cable can physically use.

    Each polygon is one room, so plan_to_graph's merged living room is split
    back into its polygons. Candidate links (doors, open gaps) are confirmed
    with polygons: a-b stays only if the walkable floor (building minus
    walls, windows and the entrance), with every OTHER room cut out, has one
    piece holding both a's node and b's. Rooms without a node (bathrooms,
    stairs) count by any part of the room.
    """
    full = plan_to_graph(plan)
    G = nx.Graph()
    G.add_nodes_from((n, a) for n, a in full.nodes(data=True) if a["type"] not in ("balcony", "front_door"))
    candidates = {(u, v) for u, v, d in full.edges(data=True)
                  if d["type"] in ("via_door", "via_opening") and u in G and v in G}

    parts = _living_parts(plan)
    if len(parts) > 1 and "living_0" in G:
        nbrs = {v if u == "living_0" else u for u, v in candidates if "living_0" in (u, v)}
        candidates = {e for e in candidates if "living_0" not in e}
        G.remove_node("living_0")
        names = [f"living_{i}" for i in range(len(parts))]
        for name, poly in zip(names, parts):
            G.add_node(name, type="living", geometry=poly, area=poly.area)
            candidates |= {(name, n) for n in nbrs}
        candidates |= {(a, b) for i, a in enumerate(names) for b in names[i + 1:]}

    inner = shapely.make_valid(plan["inner"])
    floor = inner.difference(unary_union(_blocked(plan)))
    room_geom = {n: shapely.make_valid(a["geometry"]) for n, a in G.nodes(data=True)}

    for a, b in candidates:
        # Shrinking then growing other rooms deletes thin strips drawn over a
        # doorway but restores real rooms to full size.
        with np.errstate(divide="ignore", invalid="ignore"):
            others = unary_union([g for n, g in room_geom.items() if n not in (a, b)]) \
                .buffer(-SLIVER, join_style=2).buffer(SLIVER, join_style=2)
        region = floor.difference(others)
        pieces = list(getattr(region, "geoms", [region]))

        def holds(n, piece):
            if n in node_points:
                return piece.distance(node_points[n]) < 1e-9
            return piece.intersection(room_geom[n]).area > 0

        if any(holds(a, piece) and holds(b, piece) for piece in pieces):
            G.add_edge(a, b)
    return G


def validate_submission(plan, inp, sub):
    """Every hard rule. Returns a list of {name, passed, detail, ref}; ref points at
    the hub or (hub, segment index) concerned, for drawing violations in red."""
    report = []

    def add(name, ok, detail="", ref=None):
        report.append({"name": name, "passed": bool(ok), "detail": detail, "ref": ref})

    scale = plan_scale(plan)
    tol = TOL_M * scale
    room_by_id = {r["room_id"]: r for r in inp["rooms"]}
    node_by_id = {n["node_id"]: n for n in inp["nodes"]}
    node_of_room = {n["room_id"]: n["node_id"] for n in inp["nodes"]}
    to_canvas = lambda x, y: (x * scale, y * scale)
    node_pt = {nid: to_canvas(n["x"], n["y"]) for nid, n in node_by_id.items()}

    # The submission carries the nodes too (we place our own); they must be
    # exactly the input's, or the file describes a different problem.
    if "nodes" in sub:
        given = {n["node_id"]: (n["x"], n["y"], n["room_id"]) for n in sub["nodes"]}
        same = set(given) == set(node_by_id) and all(
            math.dist(given[i][:2], (node_by_id[i]["x"], node_by_id[i]["y"])) <= TOL_M
            and given[i][2] == node_by_id[i]["room_id"] for i in given)
        add("submission: nodes match the input", same)

    # --- the input itself: one node per eligible room, inside that room ----------
    G = passage_graph(plan, {room_by_id[n["room_id"]]["name"]: Point(node_pt[n["node_id"]])
                             for n in inp["nodes"]})
    eligible = {n for n, a in G.nodes(data=True) if a["type"] in ELIGIBLE}
    named = {r["name"] for r in inp["rooms"]}
    per_room = Counter(n["room_id"] for n in inp["nodes"])
    bad = sorted(eligible ^ named) + sorted(r for r, k in per_room.items() if k != 1)
    misplaced = sorted(n["node_id"] for n in inp["nodes"]
                       if G.nodes.get(room_by_id[n["room_id"]]["name"]) is None
                       or G.nodes[room_by_id[n["room_id"]]["name"]]["geometry"].distance(Point(node_pt[n["node_id"]])) > tol)
    add("input: one node inside every eligible room", not (bad or misplaced),
        f"rooms {bad}, nodes outside their room {misplaced}" if (bad or misplaced) else "")

    # --- rules 1-3: coverage, capacity, zone --------------------------------------
    rooms = [{"id": r["name"], "area_m2": G.nodes[r["name"]]["area"] / scale**2}
             for r in inp["rooms"] if r["name"] in G]
    zones = [[room_by_id[r]["name"] for r in h["assigned_rooms"] if r in room_by_id] for h in sub["hubs"]]
    for name, ok, detail in check_territories(G, rooms, zones):
        add(name, ok, detail)
    for h in sub["hubs"]:
        want = sorted(node_of_room.get(r) for r in h["assigned_rooms"])
        add("coverage: hub's nodes are its rooms' nodes", sorted(h["assigned_nodes"]) == want,
            "" if sorted(h["assigned_nodes"]) == want else f'{h["assigned_nodes"]} vs {want}', h["hub_id"])

    hub_ids = [h["hub_id"] for h in sub["hubs"]]
    hub_pt = {h["hub_id"]: to_canvas(h["location"]["x"], h["location"]["y"]) for h in sub["hubs"]}
    add("hub ids unique", len(set(hub_ids)) == len(hub_ids))

    walls = shapely.make_valid(plan["wall"]) if plan.get("wall") is not None else None
    for h in sub["hubs"]:
        hid = h["hub_id"]
        # --- rule 6: hub point ----------------------------------------------------
        room = room_by_id.get(h["room_id"])
        hp = Point(hub_pt[hid])
        inside = room is not None and h["room_id"] in h["assigned_rooms"] and room["name"] in G \
            and G.nodes[room["name"]]["geometry"].distance(hp) <= tol
        add("hub: inside an eligible room of its own zone", inside,
            "" if inside else f'room {h["room_id"]}', hid)
        gap = walls.distance(hp) / scale if walls is not None else math.inf
        add("hub: at least 0.5 m from walls", gap >= HUB_CLEARANCE - TOL_M,
            "" if gap >= HUB_CLEARANCE - TOL_M else f"{gap:.3f} m", hid)

        # --- rule 4: ring -----------------------------------------------------------
        seq = h["closed_sequence"]
        ring_ok = len(seq) >= 3 and seq[0] == seq[-1] == hid \
            and sorted(seq[1:-1]) == sorted(h["assigned_nodes"]) and len(set(seq[1:-1])) == len(seq) - 2
        add("ring: hub -> every assigned node once -> same hub", ring_ok,
            "" if ring_ok else f"sequence {seq}", hid)
        stops = list(zip(seq, seq[1:]))
        segs = h["route_segments"]
        order_ok = [(s["from"], s["to"]) for s in segs] == stops
        add("ring: one route segment per step of the sequence, in order", order_ok,
            "" if order_ok else f'{[(s["from"], s["to"]) for s in segs]}', hid)

        def where(pid):
            return hub_pt.get(pid) if pid in hub_pt else node_pt.get(pid)

        for k, s in enumerate(segs):
            line = [to_canvas(x, y) for x, y in s["polyline"]]
            a, b = where(s["from"]), where(s["to"])
            ends = a is not None and b is not None and len(line) >= 2 \
                and math.dist(line[0], a) <= tol and math.dist(line[-1], b) <= tol
            add("ring: segment starts and ends at its stops", ends,
                "" if ends else f'{s["from"]}->{s["to"]}', (hid, k))
            # passing over another stop would look like visiting it or ending there
            others = [p for pid, p in list(node_pt.items()) + list(hub_pt.items())
                      if pid not in (s["from"], s["to"])]
            ls = LineString(line)
            touched = [p for p in others if ls.distance(Point(p)) <= tol]
            add("ring: never passes over another node or hub", not touched,
                "" if not touched else f"{len(touched)} point(s)", (hid, k))
            # --- rule 5: free space -------------------------------------------------
            for name, ok, detail in check_route(plan, line, tol):
                add(name, ok, detail, (hid, k))
    return report


# --- metrics ---------------------------------------------------------------------

def _clean(points, tol):
    """Drop repeated points (closer than tol)."""
    out = [tuple(points[0])]
    for p in points[1:]:
        if math.dist(p, out[-1]) > tol:
            out.append(tuple(p))
    return out


def _direction(p, q):
    dx, dy = q[0] - p[0], q[1] - p[1]
    return (int(np.sign(round(dx, 9))), int(np.sign(round(dy, 9))))


def ring_bends(points, tol=TOL_M):
    """Direction changes around a CLOSED ring (nodes and the hub included).

    Every turn is 90° on axis-aligned cable; a reversal counts once (slide 7).
    The ring closes at the hub, so the turn from the last run into the first
    run counts too.
    """
    pts = _clean(points, tol)
    if len(pts) > 1 and math.dist(pts[0], pts[-1]) <= tol:
        pts = pts[:-1]
    n = len(pts)
    if n < 2:
        return 0
    dirs = [_direction(pts[i], pts[(i + 1) % n]) for i in range(n)]
    return sum(1 for i in range(n) if dirs[i] != dirs[i - 1])


def count_bends(line, tol=1e-9):
    """Direction changes along an OPEN polyline (reversal counts once)."""
    pts = _clean(line, tol)
    dirs = [_direction(p, q) for p, q in zip(pts, pts[1:])]
    return sum(1 for d0, d1 in zip(dirs, dirs[1:]) if d0 != d1)


def score_submission(inp, sub):
    """The checker's metrics, recomputed from the submitted polylines (metres)."""
    stops = [(n["x"], n["y"]) for n in inp["nodes"]] + \
            [(h["location"]["x"], h["location"]["y"]) for h in sub["hubs"]]
    legs = [LineString(s["polyline"]) for h in sub["hubs"] for s in h["route_segments"]
            if len(s["polyline"]) >= 2]

    L = sum(l.length for l in legs)
    # Overlap: a stretch covered by k legs counts (k - 1) times its length,
    # which is exactly total length minus the length of the union.
    O = max(0.0, L - unary_union(legs).length) if legs else 0.0  # clamp float noise

    # Crossings: points where two cables meet away from any node or hub,
    # inside one ring or between rings, once per point.
    points = []
    for i in range(len(legs)):
        for j in range(i + 1, len(legs)):
            meet = legs[i].intersection(legs[j])
            for g in getattr(meet, "geoms", [meet]):
                if g.geom_type == "Point":
                    points.append((g.x, g.y))
    distinct = []
    for p in points:
        if all(math.dist(p, s) > TOL_M for s in stops) and all(math.dist(p, d) > TOL_M for d in distinct):
            distinct.append(p)
    X = len(distinct)

    B = 0
    for h in sub["hubs"]:
        ring = [pt for s in h["route_segments"] for pt in s["polyline"]]
        if ring:
            B += ring_bends(ring)

    areas = []
    room_area = {r["room_id"]: r["area_m2"] for r in inp["rooms"]}
    for h in sub["hubs"]:
        areas.append(sum(room_area.get(r, 0.0) for r in h["assigned_rooms"]))
    J = WEIGHTS["L"] * L + WEIGHTS["X"] * X + WEIGHTS["O"] * O + WEIGHTS["B"] * B
    return {"H": len(sub["hubs"]), "L": round(L, 4), "X": X, "O": round(O, 4), "B": B,
            "J": round(J, 4), "area_gap_m2": round(max(areas) - min(areas), 4) if areas else 0.0}
