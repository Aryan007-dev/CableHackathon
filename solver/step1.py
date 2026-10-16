"""Step 1: read a ResPlan plan correctly.

For a handful of unseen (test-split) plans this works out the plan's scale,
builds the graph of passages a cable may use, places one device in every
eligible room, and saves a picture to check by eye.

Usage:  .venv/bin/python step1.py [count]      (default 10 plans)
Output: out/step1_<plan id>.png, plus a summary table in the terminal.
"""

import json
import math
import pickle
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")  # draw straight to files; no window needed
import matplotlib.pyplot as plt
import networkx as nx
import shapely
from shapely.ops import polylabel

from resplan_utils import normalize_keys, plan_to_graph, plot_plan

HERE = Path(__file__).parent
DATA = HERE.parent / "archive (1)"
OUT = HERE / "out"

# Rooms that must get a device.
ELIGIBLE = {"living", "bedroom", "kitchen", "storage"}
# Connections a cable may pass through. The stored graph's "adjacency" edges
# are NOT here: most of them cross a solid wall.
PASSABLE = {"via_door", "via_opening"}
# Spaces a cable may never enter.
EXTERNAL = {"balcony", "front_door"}

HUB_MAX_AREA = 100.0  # m² of eligible rooms per hub
HUB_MAX_NODES = 5  # nodes per hub (the deck; the first brief said 20)


def load_plans(pkl_path, split_path, split="test"):
    """All plans in one split. Plan ids are NOT list positions, so match on p["id"]."""
    with open(split_path) as f:
        wanted = set(json.load(f)[split])
    with open(pkl_path, "rb") as f:
        data = pickle.load(f)  # ~5 s: load once and keep the list
    return [normalize_keys(p) for p in data if p["id"] in wanted]


def plan_scale(plan):
    """Canvas units per metre.

    Every plan is squeezed onto a 256-unit canvas, so each has its own scale.
    `inner.area` is the floor area in units², `area` the same floor in m².
      lengths: units / scale   = metres
      areas:   units² / scale² = m²
    """
    return math.sqrt(plan["inner"].area / plan["area"])


def passage_graph(plan):
    """CANDIDATE passages between rooms (doors and open gaps).

    Built as a fresh graph, nodes first, so a room with no passage at all
    stays in as an isolated node instead of silently vanishing (which is what
    nx.edge_subgraph would do).

    The rules say each polygon is one room, but plan_to_graph merges all
    living-room polygons into one node. Those are split back into one node per
    polygon (living_0, living_1, ...), each given every link the merged room
    had plus links to the other living parts. Edges are only candidates:
    routing.confirm_passages keeps the ones a cable can physically use.
    """
    full = plan_to_graph(plan)  # wall-aware; don't use plan["graph"]
    G = nx.Graph()
    for n, attrs in full.nodes(data=True):
        if attrs["type"] not in EXTERNAL:
            G.add_node(n, **attrs)
    for u, v, d in full.edges(data=True):
        if d["type"] in PASSABLE and u in G and v in G:
            G.add_edge(u, v, type=d["type"])

    parts = living_parts(plan)
    if len(parts) > 1 and "living_0" in G:
        links = [(nbr, G.edges["living_0", nbr]["type"]) for nbr in G.neighbors("living_0")]
        G.remove_node("living_0")
        names = [f"living_{i}" for i in range(len(parts))]
        for name, poly in zip(names, parts):
            G.add_node(name, type="living", geometry=poly, area=poly.area)
            for nbr, kind in links:
                G.add_edge(name, nbr, type=kind)
        for i, a in enumerate(names):
            for b in names[i + 1:]:
                G.add_edge(a, b, type="via_opening")
    return G


def living_parts(plan):
    """The living-room polygons, one per room, in the plan's own order."""
    geom = plan.get("living")
    if geom is None or geom.is_empty:
        return []
    return [g for g in getattr(geom, "geoms", [geom]) if g.geom_type == "Polygon" and not g.is_empty]


def eligible_rooms(G, scale):
    """One entry per eligible room, taken from the graph so ids match everywhere later."""
    return [
        {"id": n, "type": a["type"], "geometry": a["geometry"], "area_m2": a["area"] / scale**2}
        for n, a in G.nodes(data=True)
        if a["type"] in ELIGIBLE
    ]


def place_devices(rooms, plan):
    """Room id -> node Point, at the spot deepest inside the room.

    The organisers don't supply node points; teams place them. Ours go as
    far from the walls as possible (io_format then snaps them to the grid).
    Some plans draw wall pieces overlapping a room, so walls are cut out of
    the room first; otherwise a node can land inside a wall.
    """
    walls = shapely.make_valid(plan["wall"]) if plan.get("wall") is not None else None
    inner = shapely.make_valid(plan["inner"])
    devices = {}
    for r in rooms:
        geom = shapely.make_valid(r["geometry"])
        # Cable must stay inside the building outline, so the node must too.
        # (Most of ResPlan's augmented plans have an outline that wasn't
        # rotated/flipped with the rest, leaving rooms partly outside it.)
        inside = geom.intersection(inner)
        if inside.area > 0:
            geom = inside
        if walls is not None:
            geom = geom.difference(walls)
        parts = [g for g in getattr(geom, "geoms", [geom]) if g.geom_type == "Polygon" and not g.is_empty]
        if not parts:
            # Nothing left (a room drawn entirely under walls or outside the
            # outline): any point in the room. The solver will report it.
            devices[r["id"]] = r["geometry"].representative_point()
            continue
        devices[r["id"]] = polylabel(max(parts, key=lambda g: g.area), tolerance=0.5)
    return devices


def isolated_rooms(G, rooms):
    """Eligible rooms no cable could ever reach: no door or opening to anywhere."""
    return [r["id"] for r in rooms if G.degree(r["id"]) == 0]


def plot_step1(plan, G, rooms, devices, path):
    total = sum(r["area_m2"] for r in rooms)
    ax = plot_plan(plan, legend=True)

    # Passages, drawn between room anchor points. Non-eligible rooms
    # (bathrooms, stairs) have no device, so use their polylabel too.
    def anchor(n):
        if n in devices:
            return devices[n]
        geom = G.nodes[n]["geometry"]
        if geom.geom_type == "MultiPolygon":
            geom = max(geom.geoms, key=lambda g: g.area)
        return polylabel(geom, tolerance=0.5)

    colours = {"via_door": "#1f4e9c", "via_opening": "#1a8a3a"}
    for u, v, d in G.edges(data=True):
        a, b = anchor(u), anchor(v)
        ax.plot([a.x, b.x], [a.y, b.y], color=colours[d["type"]], lw=1.6,
                ls="-" if d["type"] == "via_door" else "--", zorder=4)

    for r in rooms:
        p = devices[r["id"]]
        lonely = G.degree(r["id"]) == 0
        ax.scatter([p.x], [p.y], s=70, c="red" if lonely else "black", zorder=5)
        ax.annotate(f'{r["id"]} · {r["area_m2"]:.1f} m²', (p.x, p.y), xytext=(5, 5),
                    textcoords="offset points", fontsize=7, zorder=6,
                    bbox=dict(boxstyle="round,pad=0.2", fc="white", ec="none", alpha=0.8))

    ax.plot([], [], color=colours["via_door"], label="passage: door")
    ax.plot([], [], color=colours["via_opening"], ls="--", label="passage: opening")
    ax.legend(loc="upper left", bbox_to_anchor=(1, 1), frameon=False, fontsize=8)
    ax.set_title(f'plan {plan["id"]} · eligible {total:.1f} m² · '
                 f"min hubs {math.ceil(total / HUB_MAX_AREA)}", fontsize=10)
    ax.figure.savefig(path, dpi=150, bbox_inches="tight")
    plt.close(ax.figure)  # otherwise every figure stays in memory


if __name__ == "__main__":
    count = int(sys.argv[1]) if len(sys.argv) > 1 else 10
    OUT.mkdir(exist_ok=True)
    plans = load_plans(DATA / "ResPlan.pkl", DATA / "split.json")[:count]

    print(f'{"plan":>6} {"u/m":>5} {"wall":>5} {"rooms":>5} {"elig m²":>8} {"panels":>6}  notes')
    for plan in plans:
        scale = plan_scale(plan)
        G = passage_graph(plan)
        rooms = eligible_rooms(G, scale)
        devices = place_devices(rooms, plan)
        total = sum(r["area_m2"] for r in rooms)

        notes = []
        if lonely := isolated_rooms(G, rooms):
            notes.append("no passage: " + ", ".join(lonely))
        if big := [r["id"] for r in rooms if r["area_m2"] > HUB_MAX_AREA]:
            notes.append("over 100 m²: " + ", ".join(big))
        if outside := [k for k, p in devices.items() if not G.nodes[k]["geometry"].contains(p)]:
            notes.append("device outside room: " + ", ".join(outside))

        print(f'{plan["id"]:>6} {scale:>5.1f} {plan["wall_depth"] / scale * 100:>4.0f}cm '
              f"{len(rooms):>5} {total:>8.1f} {math.ceil(total / HUB_MAX_AREA):>6}  "
              + ("; ".join(notes) or "ok"))
        plot_step1(plan, G, rooms, devices, OUT / f'step1_{plan["id"]}.png')
