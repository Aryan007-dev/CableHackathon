"""The whole solver: one ResPlan plan + its input file in, one submission out.

  input     rooms + fixed node points (io_format; a stand-in until the
            organisers' format arrives)
  zones     fewest hubs: <= 100 m² and <= 5 nodes each, rooms connected
            through doors/openings (territories.py), ties kept
  hubs      per zone, the hub spot (>= 0.5 m from walls, inside one of its
            rooms) and node order with the lowest cable cost (loops.py)
  routes    each leg's axis-aligned cable route (routing.py)
then the independent checker (validate.py) and the cost J.

Usage:  .venv/bin/python solve.py [count]     (default 10 test plans)
Output, per plan, under out/:
  input/<id>.json        the stand-in input file
  submission/<id>.json   the submission, slide 8 format
  report/<id>.json       status, metrics, every hard-rule check
  png/<id>.png           the overlay (when count <= 50)
"""

import math
import sys
import time
from collections import Counter
from types import SimpleNamespace

import matplotlib.pyplot as plt
import numpy as np
from scipy import ndimage
import shapely
from shapely.geometry import Point
from shapely.ops import unary_union

from io_format import make_input, submission, write
from loops import hub_cells, plan_loop
from resplan_utils import plot_plan
from refine import route_rings
from routing import Grid, confirm_passages, route_cells
from step1 import DATA, OUT, eligible_rooms, load_plans, passage_graph
from territories import best_partitions, candidate_territories, infeasible_reason
from validate import score_submission, validate_submission

MAX_PARTITIONS = 50  # tied fewest-hub zonings to compare by cable cost
ORDER_OPTIONS = 4  # (hub, order) options kept per zone, compared by routed J
OPTION_SLACK = 1.25  # only options within 25% of the best distance cost are routed
TRY_ZONINGS = 3  # cheapest tied zonings routed and compared by J
NODE_GAP = 2  # cells kept clear between a hub and any node


class Failed(Exception):
    """The plan can't be solved; carries the status and reason for the report."""

    def __init__(self, status, reason):
        super().__init__(reason)
        self.status, self.reason = status, reason


def prepare(plan, inp, info):
    """Everything the choices are made on: the grid, the nodes' cells and
    distance fields, where hubs may stand. Raises Failed for unsolvable plans."""
    scale = inp["units_per_metre"]
    G = passage_graph(plan)
    names = {r["room_id"]: r["name"] for r in inp["rooms"]}
    ctx = SimpleNamespace(plan=plan, inp=inp, scale=scale, G=G, names=names,
                          rid_of={v: k for k, v in names.items()},
                          nid_of={names[n["room_id"]]: n["node_id"] for n in inp["nodes"]},
                          node_pt={names[n["room_id"]]: Point(n["x"] * scale, n["y"] * scale) for n in inp["nodes"]})
    rooms = ctx.rooms = [r for r in eligible_rooms(G, scale) if r["id"] in ctx.node_pt]
    ctx.area = {r["id"]: r["area_m2"] for r in rooms}

    # Does the building outline actually hold the rooms? In most of ResPlan's
    # augmented plans it doesn't (it wasn't rotated with the rest), and then
    # parts of rooms count as "outside the building" for the cable.
    rooms_union = unary_union([shapely.make_valid(r["geometry"]) for r in eligible_rooms(G, scale)])
    outside = rooms_union.difference(shapely.make_valid(plan["inner"])).area / max(rooms_union.area, 1e-9)
    if outside > 0.01:
        info["warning"] = f"{outside:.0%} of the room area lies outside the building outline"

    if reason := infeasible_reason(rooms):
        raise Failed("infeasible", reason)

    # Cable cost is measured on the grid: build it once, plus one distance
    # field per node; every zone of every tied zoning reuses them.
    grid = ctx.grid = Grid(plan)
    outside = [r["id"] for r in rooms if not (grid.inside(r["geometry"]) & grid.free).any()]
    if outside:
        raise Failed("infeasible", "outside the building outline: " + ", ".join(outside))

    cells = ctx.cells = {i: grid.nearest_free(p.x, p.y) for i, p in ctx.node_pt.items()}
    # The organisers' benchmark keeps only plans where no eligible room is
    # under 2 m² and every node lies in one connected piece of free space
    # (speaker notes, slide 3). We still TRY every plan (our grid is stricter
    # than their geometry, and a skipped plan scores zero); these notes only
    # explain a failure.
    labels, _ = ndimage.label(grid.free)
    ctx.outside_benchmark = [f'room under 2 m²: {r["id"]}' for r in rooms if r["area_m2"] < 2.0]
    if len({labels[c] for c in cells.values()}) > 1:
        ctx.outside_benchmark.append("nodes not in one connected free area")

    # Passages a cable can't physically use come out before zoning, or a
    # "connected" zone might be impossible to wire.
    info["dropped_passages"] = [list(e) for e in confirm_passages(G, grid, cells)]
    ctx.fields = {i: grid.distance_field(c) for i, c in cells.items()}

    # A zone needs a room where its hub can stand: 0.5 m clear and reachable.
    hub_ok = ctx.hub_ok = hub_cells(grid)
    # ...and never on top of a node: in a small room the spot furthest from
    # the walls is the same for both, and a hub a few mm from a node makes
    # the ring touch that node. Keep NODE_GAP cells clear around every node.
    for r, c in cells.values():
        hub_ok[max(r - NODE_GAP, 0):r + NODE_GAP + 1, max(c - NODE_GAP, 0):c + NODE_GAP + 1] = False
    ctx.hub_rooms = {r["id"] for r in rooms
                     if (grid.inside(r["geometry"]) & hub_ok & np.isfinite(ctx.fields[r["id"]])).any()}
    return ctx


def give_up(ctx, reason):
    if ctx.outside_benchmark:
        raise Failed("excluded", "outside the benchmark (" + "; ".join(ctx.outside_benchmark) + "): " + reason)
    raise Failed("failed", reason)


def design(ctx, zones, picked, naive=False):
    """Route every ring for one zoning and one (hub, order) option per zone.
    Returns (metrics, submission) or None.

    naive: route each leg on its own, ignoring the others (the routing before
    step 7), for comparison.
    """
    grid, scale, nid_of, node_pt = ctx.grid, ctx.scale, ctx.nid_of, ctx.node_pt
    hub_cell = {f"H{k}": p[1] for k, p in enumerate(picked, 1)}
    stop_cell = {**{nid_of[i]: c for i, c in ctx.cells.items()}, **hub_cell}
    shells, rings = [], []
    for k, (zone, (_, cell, order)) in enumerate(zip(zones, picked), 1):
        hid = f"H{k}"
        hub = Point(grid.to_point(cell))
        room = next(i for i in sorted(zone) if grid.inside(ctx.G.nodes[i]["geometry"])[cell])
        rings.append([(hid, hub)] + [(nid_of[i], node_pt[i]) for i in order] + [(hid, hub)])
        shells.append({
            "hub_id": hid,
            "room_id": ctx.rid_of[room],
            "location": (hub.x / scale, hub.y / scale),
            "assigned_rooms": sorted(ctx.rid_of[i] for i in zone),
            "assigned_nodes": sorted((nid_of[i] for i in zone), key=lambda n: int(n[1:])),
            "closed_sequence": [hid] + [nid_of[i] for i in order] + [hid],
        })

    def build(routes):
        """The submission for a set of routes {(ring, leg): (polyline, cells)}."""
        hubs = []
        for i, (shell, stops) in enumerate(zip(shells, rings)):
            legs = [(fa, fb, [(x / scale, y / scale) for x, y in routes[(i, k)][0]])
                    for k, ((fa, _), (fb, _)) in enumerate(zip(stops, stops[1:]))]
            hubs.append({**shell, "legs": legs})
        return submission(ctx.inp, hubs)

    if naive:
        routes = {}
        for i, stops in enumerate(rings):
            for k, ((fa, a), (fb, b)) in enumerate(zip(stops, stops[1:])):
                blocked = [c for pid, c in stop_cell.items() if pid not in (fa, fb) and grid.free[c]]
                for c in blocked:
                    grid.free[c] = False
                found = route_cells(grid, a, b)
                for c in blocked:
                    grid.free[c] = True
                if found is None:
                    return None
                routes[(i, k)] = found
    else:
        # Step 7: all rings routed together, priced by J (refine.py). A leg may
        # not pass over any node or hub other than its own two ends.
        routes = route_rings(grid, rings, stop_cell, lambda r: score_submission(ctx.inp, build(r))["J"])
        if routes is None:
            return None
    sub = build(routes)
    return score_submission(ctx.inp, sub), sub


def better(a, b):
    """Is design a better than b? Lower J; equal J -> smaller area gap (deck)."""
    if b is None:
        return a is not None
    if a is None:
        return False
    ja, jb = a[0]["J"], b[0]["J"]
    return ja < jb - 1e-9 or (abs(ja - jb) <= 1e-9 and a[0]["area_gap_m2"] < b[0]["area_gap_m2"] - 1e-9)


def descend(ctx, zoning, current):
    """Zone by zone, try its other (hub, order) options that are close in
    distance to the best, and keep any that lower J.
    zoning: [(zone, options)]; current: the design with every zone's option 0."""
    zones = [zone for zone, _ in zoning]
    choice = [0] * len(zoning)
    for z, (_, opts) in enumerate(zoning):
        for alt in range(1, len(opts)):
            if opts[alt][0] > opts[0][0] * OPTION_SLACK:
                break  # far longer by distance: can't win back that much
            option = choice[:z] + [alt] + choice[z + 1:]
            trial = design(ctx, zones, [o[c] for (_, o), c in zip(zoning, option)])
            if better(trial, current):
                current, choice = trial, option
    return current, [o[c] for (_, o), c in zip(zoning, choice)]


def choose(ctx):
    """The best design: fewest hubs, then lowest routed J. Returns
    ((metrics, submission), zones, picked options)."""
    partitions = best_partitions(ctx.rooms, candidate_territories(ctx.G, ctx.rooms, ctx.hub_rooms),
                                 limit=MAX_PARTITIONS)
    if not partitions:
        give_up(ctx, "no zoning meets the capacity and connection rules")

    cache = {}  # zone -> plan_loop options (zones repeat across zonings)

    def options_for(zone):
        if zone not in cache:
            cache[zone] = plan_loop(ctx.grid, ctx.G, zone, ctx.cells, ctx.fields, ctx.hub_ok, options=ORDER_OPTIONS)
        return cache[zone]

    # Every tied zoning, ranked by distance cost, then the area-gap tie-break.
    ranked = []
    for partition in partitions:
        opts = [options_for(z) for z in partition]
        if any(not o for o in opts):
            continue
        sums = [sum(ctx.area[i] for i in z) for z in partition]
        ranked.append(((sum(o[0][0] for o in opts), max(sums) - min(sums)), list(zip(partition, opts))))
    if not ranked:
        give_up(ctx, "no hub position reaches every node of a zone")
    ranked.sort(key=lambda r: r[0])

    # Distance cost can't see bends at nodes or crossings, so the final
    # choices are made by ROUTED J:
    # 1. route the cheapest few tied zonings and keep the best,
    current, zoning = None, None
    for _, z in ranked[:TRY_ZONINGS]:
        trial = design(ctx, [zone for zone, _ in z], [o[0] for _, o in z])
        if better(trial, current):
            current, zoning = trial, z
    if current is None:
        give_up(ctx, "a leg has no route")

    # 2. then improve each zone's hub and order.
    current, picked = descend(ctx, zoning, current)
    return current, [zone for zone, _ in zoning], picked


def solve_with_hubs(ctx, zones, hub_points):
    """Re-solve with the zoning and every hub's position fixed (an editor drag).
    hub_points: one (x, y) in metres per zone; each is moved to the nearest
    cell where a hub may stand inside its zone. Returns the same as choose()."""
    zoning = []
    for zone, (x, y) in zip(zones, hub_points):
        mask = np.zeros_like(ctx.grid.free)
        for room_id in zone:
            mask |= ctx.grid.inside(ctx.G.nodes[room_id]["geometry"])
        spots = np.argwhere(mask & ctx.hub_ok)
        if len(spots) == 0:
            give_up(ctx, "no spot for a hub in this zone")
        want = np.array(ctx.grid.to_cell(x * ctx.scale, y * ctx.scale))
        cell = tuple(int(v) for v in spots[np.argmin(((spots - want) ** 2).sum(axis=1))])
        only = np.zeros_like(ctx.hub_ok)
        only[cell] = True
        opts = plan_loop(ctx.grid, ctx.G, zone, ctx.cells, ctx.fields, only, options=ORDER_OPTIONS)
        if not opts:
            give_up(ctx, "a node can't be reached from the hub's new spot")
        zoning.append((zone, opts))
    current = design(ctx, zones, [o[0] for _, o in zoning])
    if current is None:
        give_up(ctx, "a leg has no route")
    current, picked = descend(ctx, zoning, current)
    return current, zones, picked


def solve_plan(plan, inp):
    """Returns (status, reason, submission or None, extra info)."""
    info = {"dropped_passages": []}
    try:
        ctx = prepare(plan, inp, info)
        (_, sub), _, _ = choose(ctx)
    except Failed as f:
        return f.status, f.reason, None, info
    return "solved", None, sub, info


COLOURS = ["#e6194b", "#3cb44b", "#4363d8", "#f58231", "#911eb4", "#008080", "#f032e6", "#9a6324"]


def plot_overlay(plan, inp, sub, checks, metrics, path):
    """Zones, hub and node ids, visiting order, full rings, violations in red."""
    s = inp["units_per_metre"]
    G = passage_graph(plan)
    names = {r["room_id"]: r["name"] for r in inp["rooms"]}
    node = {n["node_id"]: (n["x"] * s, n["y"] * s) for n in inp["nodes"]}
    bad_segments = {tuple(c["ref"]) for c in checks if not c["passed"] and isinstance(c["ref"], (list, tuple))}
    bad_hubs = {c["ref"] for c in checks if not c["passed"] and isinstance(c["ref"], str)}

    ax = plot_plan(plan, legend=False)
    for n, h in enumerate(sub["hubs"]):
        colour = COLOURS[n % len(COLOURS)]
        for rid in h["assigned_rooms"]:
            geom = G.nodes[names[rid]]["geometry"]
            for poly in getattr(geom, "geoms", [geom]):
                ax.fill(*poly.exterior.xy, color=colour, alpha=0.16, zorder=3)
        for k, seg in enumerate(h["route_segments"]):
            pts = [(x * s, y * s) for x, y in seg["polyline"]]
            xs, ys = zip(*pts)
            bad = (h["hub_id"], k) in bad_segments
            ax.plot(xs, ys, color="red" if bad else colour, lw=3 if bad else 1.8,
                    ls="--" if bad else "-", zorder=6 if bad else 5)
            # direction arrow on the longest run of the leg
            (x0, y0), (x1, y1) = max(zip(pts, pts[1:]), key=lambda pq: math.dist(*pq))
            if math.dist((x0, y0), (x1, y1)) > 6:
                mx, my = (x0 + x1) / 2, (y0 + y1) / 2
                ax.annotate("", xy=(mx + (x1 - x0) * 0.04, my + (y1 - y0) * 0.04), xytext=(mx, my), zorder=6,
                            arrowprops=dict(arrowstyle="-|>", color=colour, lw=1.4, mutation_scale=11))
        hx, hy = h["location"]["x"] * s, h["location"]["y"] * s
        hub_bad = h["hub_id"] in bad_hubs
        ax.scatter([hx], [hy], marker="s", s=150, c="red" if hub_bad else colour,
                   edgecolors="black", linewidths=1.2, zorder=7)
        ax.annotate(h["hub_id"], (hx, hy), xytext=(7, -11), textcoords="offset points",
                    fontsize=8, weight="bold", zorder=8)
        for order, nid in enumerate(h["closed_sequence"][1:-1], 1):
            x, y = node[nid]
            ax.scatter([x], [y], s=120, c="white", edgecolors=colour, linewidths=2, zorder=7)
            ax.annotate(str(order), (x, y), ha="center", va="center", fontsize=7, weight="bold", zorder=8)
            ax.annotate(nid, (x, y), xytext=(7, 5), textcoords="offset points", fontsize=7, zorder=8,
                        bbox=dict(boxstyle="round,pad=0.15", fc="white", ec="none", alpha=0.8))
    valid = all(c["passed"] for c in checks)
    m = metrics
    ax.set_title(f'plan {sub["plan_id"]} · H={m["H"]} · J={m["J"]:.1f} '
                 f'(L {m["L"]:.1f} m, X {m["X"]}, O {m["O"]:.1f} m, B {m["B"]}) · '
                 f'{"VALID" if valid else "INVALID"}', fontsize=10, color="black" if valid else "red")
    path.parent.mkdir(parents=True, exist_ok=True)
    ax.figure.savefig(path, dpi=140, bbox_inches="tight")
    plt.close(ax.figure)


if __name__ == "__main__":
    count = int(sys.argv[1]) if len(sys.argv) > 1 else 10
    plans = load_plans(DATA / "ResPlan.pkl", DATA / "split.json")[:count]

    summary, times, totals = Counter(), [], Counter()
    print(f'{"plan":>6} {"status":>10} {"H":>2} {"J":>7} {"L":>7} {"X":>3} {"O":>6} {"B":>4} {"secs":>5}  checks')
    for plan in plans:
        pid = plan["id"]
        inp = make_input(plan)
        write(OUT / "input" / f"{pid}.json", inp)

        t0 = time.perf_counter()
        status, reason, sub, info = solve_plan(plan, inp)
        secs = time.perf_counter() - t0
        times.append(secs)
        summary[status] += 1

        report = {"plan_id": pid, "status": status, "reason": reason, **info}
        if sub is not None:
            write(OUT / "submission" / f"{pid}.json", sub)
            checks = validate_submission(plan, inp, sub)
            metrics = score_submission(inp, sub)
            failed = [c for c in checks if not c["passed"]]
            report.update(valid=not failed, metrics=metrics, checks=checks)
            summary["valid" if not failed else "INVALID"] += 1
            if not failed:
                totals.update(H=metrics["H"], J=metrics["J"], L=metrics["L"], X=metrics["X"],
                              O=metrics["O"], B=metrics["B"])
            names = sorted({c["name"] for c in failed})
            print(f'{pid:>6} {status:>10} {metrics["H"]:>2} {metrics["J"]:>7.1f} {metrics["L"]:>7.1f} '
                  f'{metrics["X"]:>3} {metrics["O"]:>6.1f} {metrics["B"]:>4} {secs:>5.1f}  '
                  + ("ok" if not failed else "FAILED: " + "; ".join(names)))
            if count <= 50:
                plot_overlay(plan, inp, sub, checks, metrics, OUT / "png" / f"{pid}.png")
        else:
            print(f'{pid:>6} {status:>10} {"-":>2} {"-":>7} {"-":>7} {"-":>3} {"-":>6} {"-":>4} {secs:>5.1f}  {reason}')
        write(OUT / "report" / f"{pid}.json", report)

    valid = summary["valid"]
    times.sort()
    print(f'\n{len(plans)} plans: {summary["solved"]} solved ({valid} valid, {summary["INVALID"]} invalid), '
          f'{summary["infeasible"]} infeasible, {summary["excluded"]} outside the benchmark, {summary["failed"]} failed')
    if valid:
        print("average per valid plan: " + ", ".join(
            f"{k} {totals[k] / valid:.2f}" for k in ("H", "J", "L", "X", "O", "B")))
    print(f"median {times[len(times) // 2]:.1f} s per plan, slowest {times[-1]:.1f} s")
