"""The organisers' file formats: per-plan input (rooms + fixed nodes) and submission.

INPUT: the organisers send one JSON per plan with the rooms and the fixed node
points, but its format isn't in the problem statement yet. make_input()
builds a STAND-IN with the same information from the ResPlan plan, so the
solver and validator already work from "an input file". When the real
format arrives, only read_input() needs writing; everything downstream
uses the same dict:

  {"plan_id": int, "units": "m", "units_per_metre": float,
   "rooms": [{"room_id": "R01", "name": "living_0", "type": "living", "area_m2": 41.2}, ...],
   "nodes": [{"node_id": "N1", "room_id": "R01", "x": 5.2, "y": 3.6}, ...]}

`name` is the room's id in the passage graph (ResPlan category + polygon
index). Coordinates are metres (canvas units / scale), origin lower-left, y up.

SUBMISSION: exactly the structure on slide 8 of the problem statement.
"""

import json
import math

from step1 import eligible_rooms, passage_graph, place_devices, plan_scale


def make_input(plan):
    """Stand-in input file: every eligible room with one node, in metres."""
    scale = plan_scale(plan)
    G = passage_graph(plan)
    rooms = sorted(eligible_rooms(G, scale), key=lambda r: r["id"])
    points = place_devices(rooms, plan)
    out_rooms, nodes = [], []
    for k, r in enumerate(rooms, 1):
        rid = f"R{k:02d}"
        out_rooms.append({"room_id": rid, "name": r["id"], "type": r["type"],
                          "area_m2": round(r["area_m2"], 4)})
        p = points[r["id"]]
        nodes.append({"node_id": f"N{k}", "room_id": rid,
                      "x": round(p.x / scale, 6), "y": round(p.y / scale, 6)})
    return {"plan_id": int(plan["id"]), "units": "m", "units_per_metre": scale,
            "rooms": out_rooms, "nodes": nodes}


def read_input(path):
    """The organisers' input file -> the dict above. Not written yet: format unknown."""
    raise NotImplementedError("waiting for a sample input file from the organisers")


def submission(inp, hubs):
    """Slide 8 structure, plus the rooms and nodes we placed.

    hubs: list of dicts with hub_id, room_id, location (x, y) in metres,
    assigned_rooms, assigned_nodes, closed_sequence, and legs: a list of
    (from_id, to_id, polyline in metres).

    EXTENSION: slide 8 has node ids but no node coordinates, which is fine
    when the organisers supply the nodes. We place our own, so the file also
    carries `rooms` and `nodes`; otherwise a checker couldn't know where N1 is.
    Extra keys should be harmless to a checker that ignores them.
    """
    out = []
    total = 0.0
    for h in hubs:
        segments = []
        for frm, to, line in h["legs"]:
            length = sum(math.dist(p, q) for p, q in zip(line, line[1:]))
            segments.append({"from": frm, "to": to, "length_m": round(length, 4),
                             "polyline": [[round(x, 6), round(y, 6)] for x, y in line]})
        ring = sum(s["length_m"] for s in segments)
        total += ring
        out.append({
            "hub_id": h["hub_id"],
            "room_id": h["room_id"],
            "location": {"x": round(h["location"][0], 6), "y": round(h["location"][1], 6)},
            "assigned_rooms": h["assigned_rooms"],
            "assigned_nodes": h["assigned_nodes"],
            "closed_sequence": h["closed_sequence"],
            "route_segments": segments,
            "ring_length_m": round(ring, 4),
        })
    return {"plan_id": inp["plan_id"], "units": "m", "hubs": out,
            "reported_metrics": {"hub_count": len(out), "total_length_m": round(total, 4)},
            "rooms": [{k: r[k] for k in ("room_id", "type", "area_m2")} for r in inp["rooms"]],
            "nodes": [{k: n[k] for k in ("node_id", "room_id", "x", "y")} for n in inp["nodes"]]}


def write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        json.dump(data, f, indent=1)
