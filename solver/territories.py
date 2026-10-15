"""Stage 3: split the eligible rooms into panel territories.

A territory is a group of eligible rooms that is connected through its own
rooms (doors / open gaps only) and holds at most 100 m² and 20 devices. We
want the FEWEST territories. With at most ~10 rooms per plan this is solved
exactly:

  A. list every legal group (try all combinations; 2^10 is tiny)
  B. search for the fewest groups that cover every room exactly once

Ties are kept (up to a limit) so later stages can pick by real cable length.

Usage:  .venv/bin/python territories.py [count]     (default 10 plans)
Output: out/territories_<plan id>.png when count <= 50, plus a table.
"""

import itertools
import math
import sys
from collections import Counter

import matplotlib.pyplot as plt
import networkx as nx

from resplan_utils import plot_plan
from step1 import (DATA, OUT, HUB_MAX_AREA, HUB_MAX_NODES, eligible_rooms, load_plans,
                   passage_graph, place_devices, plan_scale)
from validate import check_territories



def infeasible_reason(rooms):
    """Why no valid answer can exist, or None. A room can't be split between panels."""
    if not rooms:
        return "no living room, bedroom, kitchen or storage: nothing needs a node"
    big = [r for r in rooms if r["area_m2"] > HUB_MAX_AREA]
    if big:
        return "; ".join(f'{r["id"]} is {r["area_m2"]:.1f} m² (> {HUB_MAX_AREA:.0f})' for r in big)
    return None


def candidate_territories(G, rooms, hub_rooms=None):
    """Part A: every group of rooms that is small enough and connected on its own.

    Small enough = at most 100 m² AND at most 5 nodes (one node per room).
    hub_rooms: rooms with somewhere a hub may stand (0.5 m clear of walls).
    A group needs at least one, since its hub must be inside one of its rooms.
    """
    area = {r["id"]: r["area_m2"] for r in rooms}
    ids = list(area)
    found = []
    for k in range(1, min(len(ids), HUB_MAX_NODES) + 1):
        for group in itertools.combinations(ids, k):
            if sum(area[i] for i in group) > HUB_MAX_AREA:
                continue
            if hub_rooms is not None and not hub_rooms.intersection(group):
                continue
            # Subgraph keeps only these rooms, so a bathroom can't act as a bridge.
            if nx.is_connected(G.subgraph(group)):
                found.append(frozenset(group))
    return found


def best_partitions(rooms, candidates, limit=50):
    """Part B: all ways (up to `limit`) to cover every room once with the fewest groups.

    Always decide the group of the FIRST uncovered room, so the same answer
    isn't found again in every order. A branch is cut once even its best case
    (groups so far + max(remaining area / 100, remaining nodes / 5)) is worse
    than the best found.
    """
    order = [r["id"] for r in rooms]
    area = {r["id"]: r["area_m2"] for r in rooms}
    containing = {i: [] for i in order}
    for c in candidates:
        for i in c:
            containing[i].append(c)
    for lst in containing.values():
        lst.sort(key=len, reverse=True)  # big groups first: good answers early, more pruning

    best = math.inf
    answers = []

    def search(covered, chosen):
        nonlocal best, answers
        uncovered = [i for i in order if i not in covered]
        if not uncovered:
            if len(chosen) < best:
                best, answers = len(chosen), []
            if len(answers) < limit:
                answers.append(chosen)
            return
        left = sum(area[i] for i in uncovered)
        need = max(math.ceil(left / HUB_MAX_AREA - 1e-9), math.ceil(len(uncovered) / HUB_MAX_NODES))
        if len(chosen) + need > best:
            return  # strictly worse: equal branches are kept for ties
        if len(chosen) + 1 > best:
            return  # we'd need at least one more group
        first = uncovered[0]
        for c in containing[first]:
            if c.isdisjoint(covered):
                search(covered | c, chosen + [c])

    search(frozenset(), [])
    return answers


COLOURS = ["#e6194b", "#3cb44b", "#4363d8", "#f58231", "#911eb4", "#46f0f0", "#f032e6", "#bcf60c"]


def plot_territories(plan, G, rooms, devices, territories, path, title):
    ax = plot_plan(plan, legend=False)
    for n, t in enumerate(territories):
        colour = COLOURS[n % len(COLOURS)]
        for room_id in t:
            geom = G.nodes[room_id]["geometry"]
            for poly in getattr(geom, "geoms", [geom]):
                ax.fill(*poly.exterior.xy, color=colour, alpha=0.45, zorder=3)
            p = devices[room_id]
            ax.scatter([p.x], [p.y], s=60, c="black", zorder=5)
            ax.annotate(f"P{n + 1}", (p.x, p.y), xytext=(5, 5), textcoords="offset points",
                        fontsize=8, weight="bold", zorder=6,
                        bbox=dict(boxstyle="round,pad=0.2", fc="white", ec=colour))
    ax.set_title(title, fontsize=10)
    ax.figure.savefig(path, dpi=130, bbox_inches="tight")
    plt.close(ax.figure)


if __name__ == "__main__":
    count = int(sys.argv[1]) if len(sys.argv) > 1 else 10
    OUT.mkdir(exist_ok=True)
    plans = load_plans(DATA / "ResPlan.pkl", DATA / "split.json")[:count]

    summary = Counter()
    print(f'{"plan":>6} {"rooms":>5} {"elig m²":>8} {"by area":>7} {"found":>5} {"ties":>4} {"cands":>5}  result')
    for plan in plans:
        G = passage_graph(plan)
        rooms = eligible_rooms(G, plan_scale(plan))
        total = sum(r["area_m2"] for r in rooms)
        by_area = math.ceil(total / HUB_MAX_AREA)
        row = f'{plan["id"]:>6} {len(rooms):>5} {total:>8.1f} {by_area:>7} '

        if reason := infeasible_reason(rooms):
            summary["infeasible"] += 1
            print(row + f'{"-":>5} {"-":>4} {"-":>5}  INFEASIBLE: {reason}')
            continue

        candidates = candidate_territories(G, rooms)
        answers = best_partitions(rooms, candidates)
        chosen = answers[0]

        report = check_territories(G, rooms, chosen)
        failed = [name for name, ok, _ in report if not ok]
        summary[f"panels {len(chosen)} (area alone said {by_area})"] += 1
        summary["validator FAILED" if failed else "validator passed"] += 1
        print(row + f"{len(chosen):>5} {len(answers):>4} {len(candidates):>5}  "
              + ("FAILED: " + ", ".join(failed) if failed else "ok"))

        if count <= 50:
            plot_territories(plan, G, rooms, place_devices(rooms, plan), chosen,
                             OUT / f'territories_{plan["id"]}.png',
                             f'plan {plan["id"]} · {total:.1f} m² · {len(chosen)} panels '
                             f"(area alone: {by_area}) · {len(answers)} tied answers")

    print("\nsummary:")
    for k, v in sorted(summary.items()):
        print(f"  {v:>5}  {k}")
