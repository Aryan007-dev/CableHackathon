"""Step 7: route all the rings together so they cross and overlap as little as possible.

Routing each leg on its own (stage 4) ignores the cable already laid, so legs
cross (5 points of J each) and share lines (1 point per metre). Here every
leg is routed against all the others (routing.Occupancy), with the J prices:

  cell entered along existing cable, same direction   +1 per cell  (overlap)
  cell entered across existing cable                  +5 m         (crossing)
  turn, including at a node and closing at the hub    +0.5 m       (bend)

A return trip out of a one-door room therefore shifts one cell sideways:
parallel lines are not overlap (deck, slide 5).

Rip-up and reroute: after a first pass, each leg in turn is pulled out and
re-routed against everything else, with the directions of its neighbouring
legs known (so bends at nodes and the hub are priced). Passes repeat while
the real J (recomputed from the polylines by the checker's score) improves,
and the best set of routes seen is kept.
"""

from routing import Occupancy, heading_of, route_cells

PASSES = 4


def route_rings(grid, rings, stop_cells, score):
    """Route every leg of every ring; returns {leg key: (polyline, cells)} or None.

    rings: list of rings, each a list of stops [(id, Point), ...] that starts
           and ends with the hub.
    stop_cells: stop id -> grid cell; a leg may not pass through any stop it
           doesn't start or end at.
    score: function(routes) -> J, used to keep the best pass.
    """
    legs = []  # (ring index, leg index, from id, from point, to id, to point)
    for i, stops in enumerate(rings):
        for k, ((fa, a), (fb, b)) in enumerate(zip(stops, stops[1:])):
            legs.append((i, k, fa, a, fb, b))
    count = {i: len(stops) - 1 for i, stops in enumerate(rings)}

    occ = Occupancy(grid)
    routes = {}

    def headings(i, k):
        """Arrival direction at this leg's start, and departure direction it must
        match at its end (from the neighbouring legs of the same ring, if routed)."""
        prev = routes.get((i, (k - 1) % count[i]))
        nxt = routes.get((i, (k + 1) % count[i]))
        start = heading_of(prev[1], at_end=True) if prev else -1
        end = heading_of(nxt[1], at_end=False) if nxt else -1
        return start, end

    def lay(leg):
        i, k, fa, a, fb, b = leg
        blocked = [c for pid, c in stop_cells.items() if pid not in (fa, fb) and grid.free[c]]
        for c in blocked:
            grid.free[c] = False
        start, end = headings(i, k)
        found = route_cells(grid, a, b, occupied=occ, start_heading=start, end_heading=end)
        for c in blocked:
            grid.free[c] = True
        if found is None:
            return False
        routes[(i, k)] = found
        occ.add(found[1])
        return True

    for leg in legs:
        if not lay(leg):
            return None
    best, best_j = dict(routes), score(routes)

    for _ in range(PASSES):
        for leg in legs:
            occ.remove(routes[(leg[0], leg[1])][1])
            old = routes.pop((leg[0], leg[1]))
            if not lay(leg):  # can't happen in practice; keep the old route
                routes[(leg[0], leg[1])] = old
                occ.add(old[1])
        j = score(routes)
        if j < best_j - 1e-9:
            best, best_j = dict(routes), j
        else:
            break
    return best
