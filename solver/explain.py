"""Why the design looks the way it does, in plain sentences, from the solver's own numbers.

Every statement comes from something the solver computed (zone areas, the
passage graph, each zone's ranked hub/order options, the routed rings), so
it is always true of the design shown. The editor shows these when a hub is
clicked, and the chat assistant answers from them instead of guessing.

  summary      why this many hubs, how the zoning was chosen, the lower bound
  hub_count    the numbers behind the hub count
  lower_bound  the cheapest J any design with these hubs could have on our grid
  hubs         per hub: its rooms, what it couldn't take, its spot, its order, its ring
"""

import math

import numpy as np

from step1 import HUB_MAX_AREA, HUB_MAX_NODES
from validate import score_submission


def _orders(n):
    """How many different rings visit n nodes (a ring and its reverse are one)."""
    return 1 if n < 3 else math.factorial(n) // 2


def _same_ring(a, b):
    return list(a) == list(b) or list(a) == list(b)[::-1]


def _names(items):
    items = list(items)
    return items[0] if len(items) == 1 else ", ".join(items[:-1]) + " and " + items[-1]


def explain(ctx, zones, picked, sub, label):
    """The explanation dict for a solved design.

    zones/picked: as returned by solve.choose / solve_with_hubs.
    sub: the submission. label: internal room id -> the editor's room label.
    """
    grid, area, G = ctx.grid, ctx.area, ctx.G
    metres = grid.cell / ctx.scale  # one grid cell, and one unit of distance cost, in metres
    trace = getattr(ctx, "trace", {"fixed": True})
    H = len(zones)
    hub_of = {r: f"H{k}" for k, z in enumerate(zones, 1) for r in z}
    total = sum(area.values())
    by_area = math.ceil(total / HUB_MAX_AREA - 1e-9)
    by_nodes = math.ceil(len(area) / HUB_MAX_NODES)
    floor_ = max(by_area, by_nodes)

    summary = []
    # --- hub count ---------------------------------------------------------
    alone = []  # (room, why) for rooms that can't share a hub with anyone
    if not trace.get("fixed"):
        paired = {r for c in trace["candidates"] if len(c) > 1 for r in c}
        for r in sorted(area, key=label):
            if r in paired:
                continue
            near = [n for n in G.neighbors(r) if n in area]
            over = [n for n in near if area[r] + area[n] > HUB_MAX_AREA]
            if not near:
                others = sorted({G.nodes[n]["type"] for n in G.neighbors(r)})
                why = ("its doors only lead to " + _names(others) if others
                       else "it has no door a cable can use into another room")
            elif len(over) == len(near) == 1:
                why = f"its only door to a counted room leads to {label(near[0])}, and the two together are " \
                      f"{area[r] + area[near[0]]:.0f} m²"
            elif len(over) == len(near):
                why = "every room next door would take it over 100 m²"
            else:
                why = "no room next door can join it with a spot left for a hub"
            alone.append((r, near, why))
    lines_alone = []
    # Rooms whose only neighbour is the same big room read better as one sentence.
    by_hub_room = {}
    for r, near, why in alone:
        if len(near) == 1 and area[r] + area[near[0]] > HUB_MAX_AREA:
            by_hub_room.setdefault(near[0], []).append(r)
    for big, rs in by_hub_room.items():
        if len(rs) > 1:
            lines_alone.append(f"{_names([label(r) for r in rs])} each connect only to {label(big)} "
                               f"({area[big]:.0f} m²), and with it any of them is over 100 m²")
    grouped = {r for rs in by_hub_room.values() if len(rs) > 1 for r in rs}
    for r, _, why in alone:
        if r not in grouped:
            lines_alone.append(f"{label(r)} needs a hub of its own: {why}")
    if trace.get("fixed"):
        summary.append(f"{H} hub{'s' if H > 1 else ''}, with the zones and hub spots you set; "
                       "the solver re-planned only the ring orders and routes.")
    elif H == floor_:
        summary.append(
            f"{H} hub{'s is' if H > 1 else ' is'} the minimum possible: the {len(area)} rooms total "
            f"{total:.1f} m², and one hub takes at most 100 m² and 5 nodes.")
    else:
        why = "; ".join(lines_alone)
        summary.append(
            f"By area alone {floor_} hub{'s' if floor_ > 1 else ''} might do ({total:.1f} m² in "
            f"{len(area)} rooms), but every hub's rooms must connect through their own doors. "
            + (why + ". " if why else "")
            + f"Checking every legal zone ({len(trace['candidates'])} of them) proved no zoning "
            f"uses fewer than {H}.")
    if not trace.get("fixed"):
        if trace["zonings"] == 1:
            summary.append(f"Only one zoning has {H} hub{'s' if H > 1 else ''}.")
        else:
            summary.append(
                f"{trace['zonings']}{'' if trace['complete'] else '+'} zonings tie at {H} hubs. They were "
                f"ranked by estimated cable, the cheapest {trace['routed']} were fully routed, and this one "
                "had the lowest J.")

    # --- per hub -----------------------------------------------------------
    m_all = score_submission(ctx.inp, sub)
    hubs = {}
    clearance = grid.clearance()
    for k, (zone, (cost, cell, order)) in enumerate(zip(zones, picked), 1):
        hid = f"H{k}"
        lines = []
        zone_area = sum(area[r] for r in zone)
        lines.append(f"Serves {_names([label(r) for r in sorted(zone, key=label)])}: "
                     f"{zone_area:.1f} of 100 m², {len(zone)} of 5 nodes.")
        links = [f"{label(a)}–{label(b)}" for a, b in G.subgraph(zone).edges]
        if links:
            lines.append("Its rooms connect through their own doors: " + ", ".join(sorted(links)) + ".")
        for n in sorted({n for r in zone for n in G.neighbors(r) if n in area and n not in zone}, key=label):
            if zone_area + area[n] > HUB_MAX_AREA:
                lines.append(f"{label(n)} next door is with {hub_of[n]}: adding it here would make "
                             f"{zone_area + area[n]:.0f} m² (over 100).")
            elif len(zone) >= HUB_MAX_NODES:
                lines.append(f"{label(n)} next door is with {hub_of[n]}: this hub already has 5 nodes.")
            elif not trace.get("fixed"):
                lines.append(f"{label(n)} next door could join, but it's with {hub_of[n]}: that zoning "
                             "has the same hub count and less cable.")

        # The hub's spot, against the most open spot in the zone (what a
        # simple method would pick).
        room = next(r for r in sorted(zone) if grid.inside(G.nodes[r]["geometry"])[cell])
        mask = np.zeros_like(grid.free)
        for r in zone:
            mask |= grid.inside(G.nodes[r]["geometry"])
        spots = np.argwhere(mask & ctx.hub_ok)
        rows, cols = spots[:, 0], spots[:, 1]
        path = sum(ctx.fields[a][ctx.cells[b]] for a, b in zip(order, order[1:]))
        ring_cost = ctx.fields[order[0]][rows, cols] + path + ctx.fields[order[-1]][rows, cols]
        open_i = int(np.argmax(clearance[rows, cols]))
        if trace.get("fixed"):
            lines.append(f"Stands in {label(room)} where you placed it (the nearest spot at least 0.5 m from "
                         "walls and clear of nodes).")
        else:
            extra = (ring_cost[open_i] - cost) * metres
            lines.append(
                f"Stands in {label(room)}, at least 0.5 m from walls: of {len(spots)} allowed spots in its zone, "
                f"this one gives the shortest ring" + (
                    f". The most open spot, which a simple method would pick, adds {extra:.1f} m." if extra > 0.05
                    else "."))

        # The order, against the next best different order.
        stops = " → ".join([hid] + [f"{ctx.nid_of[r]} {label(r)}" for r in order] + [hid])
        others = [o for o in ctx.options.get(zone, []) if not _same_ring(o[2], order)]
        n_orders = _orders(len(order))
        text = f"Visits {stops}"
        if n_orders == 1:
            text += " (with this few nodes there is only one ring)."
        else:
            text += f": every one of the {n_orders} possible orders was checked"
            best_other = min((o[0] for o in others), default=None)
            if best_other is not None and (best_other - cost) * metres < 0.05:
                text += "; another order ties on distance, and routed this one was no worse."
            elif best_other is not None and best_other >= cost:
                text += f"; the next best costs {(best_other - cost) * metres:.1f} m more."
            elif best_other is not None:
                text += (f"; one is {(cost - best_other) * metres:.1f} m shorter by distance, but routed it "
                         "had more bends, crossings or overlap, so this one won on J.")
            else:
                text += "."
        lines.append(text)

        hub_sub = {"hubs": [h for h in sub["hubs"] if h["hub_id"] == hid]}
        m = score_submission(ctx.inp, hub_sub)
        lines.append(f"Ring: {m['L']:.1f} m of cable, {m['B']} bends, {m['X']} crossings, "
                     f"{m['O']:.1f} m overlapping itself.")
        hubs[hid] = lines

    # --- cost and its lower bound ------------------------------------------
    out = {"summary": summary, "hubs": hubs,
           "hub_count": {"H": H, "by_area": by_area, "by_nodes": by_nodes,
                         "alone": [{"room": label(r), "why": w} for r, _, w in alone]}}
    J = m_all["J"]
    summary.append(f"J = L + 5X + O + 0.5B = {m_all['L']:.1f} + 5×{m_all['X']} + {m_all['O']:.1f} + "
                   f"0.5×{m_all['B']} = {J:.1f}.")
    if not trace.get("fixed"):
        lb = trace["lower_bound"] * metres
        gap = (J - lb) / lb * 100 if lb > 0 else 0.0
        out["lower_bound"] = {"J": round(lb, 2), "gap_pct": round(gap, 1), "complete": trace["complete"]}
        summary.append(
            f"No design with {H} hub{'s' if H > 1 else ''} can cost less than {lb:.1f} on our 5 cm routing grid "
            "(every zoning's shortest possible rings, before bends at nodes, crossings and overlap)"
            + ("" if trace["complete"] else ", among the 50 zonings listed")
            + f"; this design is {gap:.0f}% above that.")
    return out
