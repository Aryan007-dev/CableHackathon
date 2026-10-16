"""Baselines to measure our solver against, on exactly the same footing.

Each takes the context solve.prepare() builds (same nodes, grid, distance
fields, hub spots and passage graph), chooses zones, hubs and node orders
its own way, and routes every leg on its own (solve.design(naive=True)),
as a classic method would. The independent checker and the deck's ranking
then judge all of them alike.

  greedy   grow each zone from the biggest unassigned room, adding the
           nearest door-connected room while it fits; hub at the zone's most
           open spot; visit nodes nearest-first.
  savings  Clarke & Wright (1964), the classic heuristic for capacitated
           vehicle routing: every room starts as its own ring; repeatedly
           merge the two door-connected zones whose merge saves the most
           cable, while the merged zone still fits.

There is no TSP baseline on purpose: our ring order per hub is already
exact (at most 5 nodes per hub, every order tried), so a TSP solver would
find the same orders.
"""

import math

import networkx as nx
import numpy as np

from loops import plan_loop
from solve import Failed, design, give_up
from step1 import HUB_MAX_AREA, HUB_MAX_NODES

LABELS = {"greedy": "Greedy", "savings": "Clarke–Wright"}


def fits(ctx, zone):
    """The deck's zone rules: ≤ 100 m², ≤ 5 nodes, rooms connected through
    their own doors, and somewhere a hub may stand (territories.py's tests)."""
    return (len(zone) <= HUB_MAX_NODES
            and sum(ctx.area[i] for i in zone) <= HUB_MAX_AREA + 1e-9
            and bool(ctx.hub_rooms & zone)
            and nx.is_connected(ctx.G.subgraph(zone)))


def _neighbours(ctx, zone, free):
    """Unassigned eligible rooms sharing a passage with the zone."""
    return {n for r in zone for n in ctx.G.neighbors(r) if n in free}


def _zone_mask(ctx, zone):
    mask = np.zeros_like(ctx.grid.free)
    for r in zone:
        mask |= ctx.grid.inside(ctx.G.nodes[r]["geometry"])
    return mask


def greedy(ctx):
    """Greedy zones, hub at the most open spot, nearest-neighbour order.
    Returns (zones, picked) for solve.design; raises Failed if stuck."""
    free = {r["id"] for r in ctx.rooms}
    zones = []
    while free:
        seed = max(free, key=lambda r: ctx.area[r])
        zone = frozenset([seed])
        free.discard(seed)
        while True:
            # The nearest addable room, measured from the seed's node.
            options = [n for n in _neighbours(ctx, zone, free) if fits(ctx, zone | {n})]
            if not options:
                break
            near = min(options, key=lambda n: ctx.fields[seed][ctx.cells[n]])
            zone = zone | {near}
            free.discard(near)
        zones.append(zone)

    clearance = ctx.grid.clearance()
    picked = []
    for zone in zones:
        spots = np.argwhere(_zone_mask(ctx, zone) & ctx.hub_ok)
        if len(spots) == 0:
            give_up(ctx, "greedy: a zone has nowhere for its hub")
        hub = tuple(int(v) for v in max(spots, key=lambda c: clearance[tuple(c)]))
        # Nearest neighbour from the hub, by cable distance.
        order, at, left = [], None, set(zone)
        while left:
            nxt = min(left, key=lambda r: ctx.fields[r][hub] if at is None else ctx.fields[r][ctx.cells[at]])
            order.append(nxt)
            left.discard(nxt)
            at = nxt
        cost = ctx.fields[order[0]][hub] + ctx.fields[order[-1]][hub] + sum(
            ctx.fields[a][ctx.cells[b]] for a, b in zip(order, order[1:]))
        if not math.isfinite(cost):
            give_up(ctx, "greedy: a node can't be reached from its hub")
        picked.append((float(cost), hub, order))
    return zones, picked


def savings(ctx):
    """Clarke–Wright savings with the deck's zone rules. Each zone's cost is
    its best ring (best hub spot, exact order: loops.plan_loop)."""
    cache = {}

    def best(zone):
        if zone not in cache:
            found = plan_loop(ctx.grid, ctx.G, zone, ctx.cells, ctx.fields, ctx.hub_ok, options=1)
            cache[zone] = found[0] if found else None
        return cache[zone]

    zones = [frozenset([r["id"]]) for r in ctx.rooms]
    if any(best(z) is None for z in zones if ctx.hub_rooms & z):
        give_up(ctx, "Clarke–Wright: a room's node can't be reached")
    while True:
        merge, gain = None, -math.inf
        for i, a in enumerate(zones):
            for b in zones[i + 1:]:
                ab = a | b
                if not _neighbours(ctx, a, b) or not fits(ctx, ab):
                    continue
                joined = best(ab)
                if joined is None:
                    continue
                # A zone without a hub spot of its own must be merged: treat its ring as free.
                cost = lambda z: best(z)[0] if (ctx.hub_rooms & z) and best(z) else 0.0
                saving = cost(a) + cost(b) - joined[0]
                if saving > gain:
                    merge, gain = (a, b), saving
        if merge is None:
            break
        a, b = merge
        zones = [z for z in zones if z not in (a, b)] + [a | b]
    if any(not (ctx.hub_rooms & z) or best(z) is None for z in zones):
        give_up(ctx, "Clarke–Wright: a zone has nowhere for its hub")
    return zones, [best(z) for z in zones]


METHODS = {"greedy": greedy, "savings": savings}


def run(ctx, method):
    """(metrics, submission) for one baseline, routed leg by leg. Raises Failed."""
    zones, picked = METHODS[method](ctx)
    result = design(ctx, zones, picked, naive=True)
    if result is None:
        raise Failed("failed", f"{LABELS[method]}: a leg has no route")
    return result
