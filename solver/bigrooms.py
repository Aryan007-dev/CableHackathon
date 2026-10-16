"""Extended rules: a room over 100 m² is split so two (or more) hubs can serve it.

The deck can't serve such a room at all (a hub takes at most 100 m², and a
room's single node sits on one ring), and the organisers drop these plans
from their benchmark. For our own plans we split the room into
ceil(area / 100) parts of equal area, cut across its long side; each part
becomes a room with its own node. Parts touch along the cut with no wall
between them, so the passage graph links them as open passages.

The result is flagged as outside the deck's rules (it adds nodes), and only
plans with an oversized room are changed.
"""

import math

from shapely.geometry import MultiPolygon, box

from export_editor import ROOM_TYPES, polygons
from step1 import ELIGIBLE, HUB_MAX_AREA, plan_scale


def _equal_parts(poly, k):
    """Cut `poly` into k pieces of equal area with cuts across its long side."""
    x0, y0, x1, y1 = poly.bounds
    along_x = (x1 - x0) >= (y1 - y0)
    lo, hi = (x0, x1) if along_x else (y0, y1)

    def before(c):  # the part of poly before the cut at c
        return poly.intersection(box(x0 - 1, y0 - 1, c, y1 + 1) if along_x else box(x0 - 1, y0 - 1, x1 + 1, c))

    cuts = []
    for j in range(1, k):
        want, a, b = poly.area * j / k, lo, hi
        for _ in range(40):  # bisection: the area before a cut grows with the cut
            mid = (a + b) / 2
            a, b = (mid, b) if before(mid).area < want else (a, mid)
        cuts.append((a + b) / 2)
    edges = [lo - 1] + cuts + [hi + 1]
    parts = []
    for c0, c1 in zip(edges, edges[1:]):
        slab = box(c0, y0 - 1, c1, y1 + 1) if along_x else box(x0 - 1, c0, x1 + 1, c1)
        parts.append(poly.intersection(slab))
    return parts


def split_big_rooms(plan):
    """(plan, notes, labels). A copy of `plan` with every eligible room over
    100 m² cut into parts, a note per split room, and labels for the parts
    ({(kind, n): "Living · part 1 of 2"}, as export_editor numbers rooms).
    The plan is returned unchanged (and notes empty) when nothing is too big."""
    scale = plan_scale(plan)
    out, notes, labels = dict(plan), [], {}
    for kind in ROOM_TYPES:
        if kind not in ELIGIBLE:
            continue
        rooms = polygons(plan.get(kind))
        if not any(p.area / scale**2 > HUB_MAX_AREA for p in rooms):
            continue
        kept = []  # (polygon, None | (original room number, part, parts))
        for m, p in enumerate(rooms, 1):
            area = p.area / scale**2
            if area <= HUB_MAX_AREA:
                kept.append((p, None))
                continue
            k = math.ceil(area / HUB_MAX_AREA)
            pieces = [g for part in _equal_parts(p, k) for g in polygons(part)]
            notes.append(f"{kind} of {area:.0f} m² split into {len(pieces)} parts, one hub each at most")
            kept += [(g, (m, i, len(pieces))) for i, g in enumerate(pieces, 1)]
        out[kind] = MultiPolygon([p for p, _ in kept])
        for n, (_, part) in enumerate(kept, 1):
            if part:
                m, i, k = part
                name = kind.capitalize() + (f" {m}" if len(rooms) > 1 else "")
                labels[(kind, n)] = f"{name} · part {i} of {k}"
    return out, notes, labels


def needs_split(plan):
    scale = plan_scale(plan)
    return any(p.area / scale**2 > HUB_MAX_AREA
               for kind in ELIGIBLE for p in polygons(plan.get(kind)))
