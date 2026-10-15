"""Stages 5 and 6: where each hub goes, and the order its ring visits nodes.

Both are decided together, because the best hub spot depends on the order
and vice versa. Everything is measured in real cable cost (cells walked plus
0.5 m per bend), never straight-line distance, so walls are respected.

  1. distance fields: one per node, the cable cost from it to every cell
  2. best_paths: for every pair (first node, last node), the cheapest
     order visiting all of a zone's nodes once (Held-Karp, exact; a zone
     has at most 5 nodes, so this is instant)
  3. a hub candidate is a cell inside one of the zone's rooms and at least
     0.5 m from every wall; its ring cost = to the first node + the best
     path + back from the last
  4. the cheapest candidate wins
"""

import itertools
import math

import numpy as np


def best_paths(D):
    """Held-Karp over a cost matrix D (n x n).

    Returns {(start, end): (cost, order)}: the cheapest order that visits all
    n nodes exactly once, starting at `start` and ending at `end`.
    dp[(visited mask, last node)] = (cost so far, previous node). Masks only
    grow, so looping over them in increasing order processes every state
    after all the states that lead to it.
    """
    n = len(D)
    full = (1 << n) - 1
    result = {}
    for s in range(n):
        dp = {(1 << s, s): (0.0, None)}
        for mask in range(1 << s, full + 1):
            if not mask >> s & 1:
                continue
            for e in range(n):
                state = dp.get((mask, e))
                if state is None:
                    continue
                for k in range(n):
                    if mask >> k & 1:
                        continue
                    key = (mask | 1 << k, k)
                    cost = state[0] + D[e][k]
                    if cost < dp.get(key, (math.inf,))[0]:
                        dp[key] = (cost, e)
        for e in range(n):
            if (full, e) not in dp:
                continue
            order, mask, cur = [e], full, e
            while dp[(mask, cur)][1] is not None:
                prev = dp[(mask, cur)][1]
                mask ^= 1 << cur
                cur = prev
                order.append(cur)
            result[(s, e)] = (dp[(full, e)][0], order[::-1])
    return result


HUB_CLEARANCE_M = 0.5  # a hub must stand at least this far from every wall


def hub_cells(grid):
    """Mask of cells where a hub may stand: free and at least 0.5 m from any obstacle.

    The distance transform gives, per free cell, the distance from its centre
    to the nearest BLOCKED cell's centre. The obstacle itself can sit anywhere
    in that blocked square, up to half a diagonal (0.71 cells) closer, so one
    extra cell of margin guarantees the 0.5 m with the 1 mm checker.
    """
    need = HUB_CLEARANCE_M * grid.scale / grid.cell + 1.0
    return grid.free & (grid.clearance() >= need)


ENUMERATE_UP_TO = 7  # nodes; above this, only Held-Karp's best orders are considered


def plan_loop(grid, G, territory, cells, fields, hub_ok, options=1):
    """The cheapest ways to wire one territory: a list of up to `options`
    (cost, hub cell, node order), best first, each with a DIFFERENT order
    (a ring and its reverse count as one). Empty if unreachable.

    Distance can't see crossings, so the second- and third-best orders are
    kept: if the routed design crosses itself, solve.py tries them.

    cells:  room id -> the node's grid cell
    fields: room id -> distance field from that node
    hub_ok: cells where a hub may stand (see hub_cells); a candidate must
            also lie inside one of this territory's rooms
    """
    ids = sorted(territory)  # fixed order so results repeat exactly
    n = len(ids)
    D = [[fields[a][cells[b]] for b in ids] for a in ids]
    if n <= ENUMERATE_UP_TO:
        # few nodes (the deck allows 5): every order, exactly
        orders = [(sum(D[p][q] for p, q in zip(o, o[1:])), list(o))
                  for o in itertools.permutations(range(n)) if n == 1 or o[0] < o[-1]]
    else:
        orders = [v for (s, e), v in best_paths(D).items() if s < e]

    mask = np.zeros_like(grid.free)
    for room_id in ids:
        mask |= grid.inside(G.nodes[room_id]["geometry"])
    candidates = np.argwhere(mask & hub_ok)
    if len(candidates) == 0:
        return []
    rows, cols = candidates[:, 0], candidates[:, 1]
    reach = {i: fields[room_id][rows, cols] for i, room_id in enumerate(ids)}  # cost to each candidate

    found = []
    for path_cost, order in orders:
        loop = reach[order[0]] + path_cost + reach[order[-1]]  # one value per candidate cell
        i = int(np.argmin(loop))
        if math.isfinite(loop[i]):
            found.append((float(loop[i]), (int(rows[i]), int(cols[i])), [ids[j] for j in order]))
    found.sort(key=lambda f: f[0])
    return found[:options]
