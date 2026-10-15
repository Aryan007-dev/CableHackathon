"""Stage 4: the routing grid and cable pathfinding.

The plan is turned into a grid of cells (1 canvas unit ≈ 5 cm each).
A cell is FREE only when its whole square lies inside the building (`inner`)
and touches no wall, window or the front door. Doors already fill the gaps
in walls, and balconies lie outside `inner`, so neither needs special
handling. Because blocked cells can never be entered, routes can't cross
walls, windows or the outside: those rules hold by construction.

Whole squares, not just centres: a route runs between cell centres, so if
every square it passes through is clear, the route keeps at least half a
cell from every obstacle. The organisers' checker works to 1 mm, so a cable
merely clipping a wall corner would make the whole plan score zero.

Paths are found with A*, moving in 4 directions only (cable must run
horizontally or vertically). The search state is (cell, heading) so every
turn can cost extra; a bend costs 0.5 m of cable, the same as in the
organisers' cost J = L + 5X + O + 0.5B.

Usage:  .venv/bin/python routing.py [count]     (default 10 plans)
Routes node -> node across every passage between eligible rooms, checks each
route with the validator, and saves out/routes_<plan id>.png.
"""

import heapq
import itertools
import sys
import time
from collections import Counter, deque

import matplotlib.pyplot as plt
import numpy as np
import shapely
from scipy import ndimage
from scipy.sparse import csr_matrix
from scipy.sparse.csgraph import dijkstra
from shapely.geometry import LineString

from resplan_utils import plot_plan
from step1 import (DATA, OUT, eligible_rooms, load_plans, passage_graph,
                   place_devices, plan_scale)
from validate import check_route

CELL = 1.0  # canvas units per grid cell (~5 cm at a typical 18-20 units/m)
BEND_M = 0.5  # metres of cable one bend is worth (the weight of B in J)
CROSSING_M = 5.0  # metres of cable one crossing is worth (the weight of X in J)
# Every window blocks, including "windows" between two indoor rooms that look
# like mislabelled doors: the organisers define free space as
# inner - wall - window, so passing through one would make the plan invalid.
# Balconies normally lie outside `inner` anyway, but not in plans whose
# outline is broken (most augmented plans), so they are blocked explicitly.
BLOCKED_LAYERS = ("wall", "window", "front_door", "balcony")

# 4-connected moves, as (row, col) steps.
MOVES = ((0, 1), (1, 0), (0, -1), (-1, 0))


class Grid:
    """Free/blocked cells for one plan, plus conversions between cells and canvas points."""

    def __init__(self, plan, cell=CELL):
        self.scale = plan_scale(plan)
        self.bend_cost = BEND_M * self.scale / cell  # a bend, in cells
        x0, y0, x1, y1 = plan["inner"].bounds
        self.cell = cell
        self.x0, self.y0 = x0 - cell, y0 - cell  # one cell of margin all round
        self.cols = int(np.ceil((x1 - self.x0) / cell)) + 2
        self.rows = int(np.ceil((y1 - self.y0) / cell)) + 2

        xs = self.x0 + (np.arange(self.cols) + 0.5) * cell
        ys = self.y0 + (np.arange(self.rows) + 0.5) * cell
        self.X, self.Y = np.meshgrid(xs, ys)  # X[row, col], Y[row, col]
        h = cell / 2
        self._squares = shapely.box(self.X - h, self.Y - h, self.X + h, self.Y + h)

        # Each layer is tested separately: no polygon set operations, which
        # fail on the dataset's few invalid shapes.
        free = shapely.contains(self._prepared(plan["inner"]), self._squares)
        for layer in BLOCKED_LAYERS:
            if plan.get(layer) is not None and not plan[layer].is_empty:
                free &= ~shapely.intersects(self._prepared(plan[layer]), self._squares)
        self.free = free
        self._graph = None

    @staticmethod
    def _prepared(geom):
        geom = shapely.make_valid(geom)  # repairs self-intersections
        shapely.prepare(geom)  # builds an index, so the test is fast
        return geom

    def inside(self, geom):
        """Boolean mask of cells whose CENTRE lies in `geom` (used to tell rooms apart)."""
        return shapely.contains_xy(self._prepared(geom), self.X, self.Y)

    def to_cell(self, x, y):
        return int((y - self.y0) // self.cell), int((x - self.x0) // self.cell)

    def to_point(self, cell):
        r, c = cell
        return self.x0 + (c + 0.5) * self.cell, self.y0 + (r + 0.5) * self.cell

    def nearest_free(self, x, y):
        """The free cell closest to a point (normally the cell the point is in)."""
        start = self.to_cell(x, y)
        seen, queue = {start}, deque([start])
        while queue:
            r, c = queue.popleft()
            if 0 <= r < self.rows and 0 <= c < self.cols and self.free[r, c]:
                return r, c
            for dr, dc in MOVES:
                nxt = (r + dr, c + dc)
                if nxt not in seen:
                    seen.add(nxt)
                    queue.append(nxt)
        raise ValueError("no free cell anywhere")

    def _state_graph(self):
        """Sparse graph over (cell, heading) states with the same costs as find_path.

        Node id = (row * cols + col) * 4 + heading. Moving one cell in
        direction d from heading h costs 1, plus bend_cost when h != d.
        Built with numpy in one go, then searched by scipy (compiled code).
        The edge list is kept (in the matrix's own order) so routing can
        re-price edges for cable already laid without rebuilding anything.
        """
        if self._graph is None:
            R, C = self.rows, self.cols
            idx = np.arange(R * C).reshape(R, C)
            src, dst, cost, horizontal = [], [], [], []
            for d, (dr, dc) in enumerate(MOVES):
                # cells that are free AND whose neighbour in direction d is free
                ok = np.zeros((R, C), bool)
                r0, r1 = max(0, -dr), R - max(0, dr)
                c0, c1 = max(0, -dc), C - max(0, dc)
                ok[r0:r1, c0:c1] = self.free[r0:r1, c0:c1] & self.free[r0 + dr:r1 + dr, c0 + dc:c1 + dc]
                a = idx[ok]
                b = a + dr * C + dc
                for h in range(4):
                    src.append(a * 4 + h)
                    dst.append(b * 4 + d)
                    cost.append(np.full(a.size, 1.0 + (0 if h == d else self.bend_cost)))
                    horizontal.append(np.full(a.size, d % 2 == 0))
            n = R * C * 4
            src, dst = np.concatenate(src), np.concatenate(dst)
            cost, horizontal = np.concatenate(cost), np.concatenate(horizontal)
            # Learn the order scipy stores the edges in, so new weights can be
            # dropped straight into a copy of the matrix.
            order = csr_matrix((np.arange(1, src.size + 1, dtype=float), (src, dst)), shape=(n, n))
            perm = order.data.astype(np.int64) - 1
            self._graph = csr_matrix((cost[perm], order.indices, order.indptr), shape=(n, n))
            self._edge_cell = dst[perm] // 4  # the cell each edge enters
            self._edge_horizontal = horizontal[perm]
            self._edge_cost = cost[perm]
        return self._graph

    def priced_graph(self, occupied):
        """The state graph with each edge re-priced for cable already laid.

        Entering a cell along cable running the same way: +1 (overlap).
        Entering a cell across cable running the other way: +5 m (crossing).
        Entering a cell that is blocked right now (another leg's stop): never.
        """
        base = self._state_graph()
        flat_h, flat_v = occupied.h.ravel() > 0, occupied.v.ravel() > 0
        cross = CROSSING_M * self.scale / self.cell
        cell, horiz = self._edge_cell, self._edge_horizontal
        same = np.where(horiz, flat_h[cell], flat_v[cell])
        other = np.where(horiz, flat_v[cell], flat_h[cell])
        price = self._edge_cost + same + cross * other
        price[~self.free.ravel()[cell]] = np.inf
        return csr_matrix((price, base.indices, base.indptr), shape=base.shape)

    def distance_field(self, cell):
        """Cable cost from `cell` to EVERY cell (np.inf where unreachable).

        Starting in all four headings at once means the first move is never
        a bend, exactly like find_path. Paths reversed cost the same, so the
        field also gives the cost from any cell back to `cell`.
        """
        r, c = cell
        starts = [(r * self.cols + c) * 4 + h for h in range(4)]
        dist = dijkstra(self._state_graph(), directed=True, indices=starts, min_only=True)
        return dist.reshape(self.rows, self.cols, 4).min(axis=2)

    def clearance(self):
        """Per free cell: distance in cells from its centre to the nearest blocked cell's centre."""
        return ndimage.distance_transform_edt(self.free)


def confirm_passages(G, grid, device_cells):
    """Drop passage edges a cable can't physically use; returns the dropped (a, b) pairs.

    plan_to_graph decides passages with buffered polygon tests, and it
    promotes any window touching two indoor rooms to a door. The rules say
    windows never count, and the grid is the physical truth, so an edge a-b
    stays only if a free path joins them while staying in a, b or unlabelled
    space (doors, gaps), never a third room.

    For a room with a node the path must reach the NODE: some rooms are cut
    in two by a wall drawn through them, and a door into the other half
    doesn't help.
    """
    masks = {n: grid.inside(a["geometry"]) & grid.free for n, a in G.nodes(data=True)}
    dropped = []
    for a, b in list(G.edges):
        # Some plans draw a thin strip of a third room over a doorway, which
        # must not block it. An "opening" (shrink one cell, then grow back)
        # deletes strips that thin but returns real rooms to full size, so no
        # path can sneak round a third room's edge.
        third = np.zeros_like(grid.free)
        for n, m in masks.items():
            if n not in (a, b):
                third |= ndimage.binary_opening(m)
        allowed = grid.free & ~third
        labels, _ = ndimage.label(allowed)  # 4-connected pieces

        def pieces(n):
            if n in device_cells:
                return {labels[device_cells[n]]}
            return set(np.unique(labels[masks[n]]))

        if not (pieces(a) & pieces(b)) - {0}:
            G.remove_edge(a, b)
            dropped.append((a, b))
    return dropped


def find_path(grid, start, goal, bend_cost=None, occupied=None, start_heading=-1, end_heading=-1):
    """A* over (cell, heading). Returns the list of cells from start to goal, or None.

    g = cells walked + bend_cost per turn, plus, when `occupied` is given
    (cable already laid by other legs; see Occupancy):
      + 1 per cell entered along cable running the SAME way (overlap: 1 per m)
      + 5 m per cell entered across cable running the OTHER way (a crossing)
    start_heading: the direction the cable arrived from at the start point;
    leaving in a different direction is a bend (nodes count in B).
    end_heading: the direction the cable must leave the goal in (closing the
    ring at the hub); arriving in a different direction is a bend.
    The heuristic (Manhattan distance) never overestimates, so the first
    time the goal is settled its path is the cheapest one.
    """
    if bend_cost is None:
        bend_cost = grid.bend_cost
    cross_cost = CROSSING_M * grid.scale / grid.cell
    if start == goal:
        return [start]
    gr, gc = goal
    h = lambda cell: abs(cell[0] - gr) + abs(cell[1] - gc)

    tie = itertools.count()  # breaks heap ties without comparing cells
    # heading -1 = "no direction yet", so the first step is never a bend
    heap = [(h(start), next(tie), 0, start, start_heading)]
    best = {(start, start_heading): 0}
    came_from = {}
    DONE = "done"
    while heap:
        _, _, g, cell, heading = heapq.heappop(heap)
        if cell == DONE:
            path = []
            state = heading  # the goal state we finished from
            while True:
                path.append(state[0])
                if state not in came_from:
                    break
                state = came_from[state]
            return path[::-1]
        if g > best.get((cell, heading), np.inf):
            continue  # a cheaper way here was already processed
        if cell == goal:
            # finish through a virtual step that charges the closing bend
            extra = bend_cost if end_heading not in (-1, heading) else 0
            heapq.heappush(heap, (g + extra, next(tie), g + extra, DONE, (cell, heading)))
            continue
        r, c = cell
        for d, (dr, dc) in enumerate(MOVES):
            nr, nc = r + dr, c + dc
            if not (0 <= nr < grid.rows and 0 <= nc < grid.cols) or not grid.free[nr, nc]:
                continue
            ng = g + 1 + (bend_cost if heading not in (-1, d) else 0)
            if occupied is not None:
                same, other = (occupied.h, occupied.v) if d % 2 == 0 else (occupied.v, occupied.h)
                ng += (same[nr, nc] > 0) + cross_cost * (other[nr, nc] > 0)
            state = ((nr, nc), d)
            if ng < best.get(state, np.inf):
                best[state] = ng
                came_from[state] = (cell, heading)
                heapq.heappush(heap, (ng + h((nr, nc)), next(tie), ng, (nr, nc), d))
    return None


class Occupancy:
    """How many legs run through each cell, horizontally (h) and vertically (v).

    A cell where a leg turns counts in both. The cells right at a leg's two
    ends are left out: legs are supposed to meet at nodes and hubs.
    """

    def __init__(self, grid):
        self.h = np.zeros(grid.free.shape, np.int32)
        self.v = np.zeros(grid.free.shape, np.int32)

    @staticmethod
    def marks(path):
        out = []
        for i in range(1, len(path) - 1):
            for a, b in ((path[i - 1], path[i]), (path[i], path[i + 1])):
                out.append((path[i], "h" if a[0] == b[0] else "v"))
        return set(out)

    def add(self, path, sign=1):
        for (r, c), o in self.marks(path):
            getattr(self, o)[r, c] += sign

    def remove(self, path):
        self.add(path, -1)


def heading_of(path, at_end=True):
    """Direction index (into MOVES) of a path's last (or first) step, or -1."""
    if len(path) < 2:
        return -1
    a, b = (path[-2], path[-1]) if at_end else (path[0], path[1])
    return MOVES.index((b[0] - a[0], b[1] - a[1]))


def corners(path):
    """Cells -> just the start, the cells where the path turns, and the end."""
    if len(path) < 3:
        return list(path)
    keep = [path[0]]
    for prev, cur, nxt in zip(path, path[1:], path[2:]):
        if (cur[0] - prev[0], cur[1] - prev[1]) != (nxt[0] - cur[0], nxt[1] - cur[1]):
            keep.append(cur)
    keep.append(path[-1])
    return keep


def attach(grid, cells, a, b):
    """Axis-aligned polyline from point a to point b along the corner cells.

    The path runs through cell CENTRES, but a and b sit anywhere in their
    cells. Instead of a diagonal stub from a to its cell centre, the first
    straight run is slid sideways to pass exactly through a (and the last
    through b). A run stays inside its own row or column of free cells, so
    sliding it by less than half a cell keeps it clear of obstacles.
    """
    pts = [list(grid.to_point(c)) for c in cells]
    (ax, ay), (bx, by) = a, b
    if len(pts) == 1:  # both points in the same cell: an L inside it
        line = [(ax, ay), (bx, ay), (bx, by)]
    elif len(pts) == 2 and cells[0][0] == cells[1][0] and abs(ay - by) > 1e-9:
        # one horizontal run but a and b at different heights: jog in the middle
        mx = (pts[0][0] + pts[1][0]) / 2
        mx = grid.to_point(grid.to_cell(mx, pts[0][1]))[0]  # a cell centre on the run
        line = [(ax, ay), (mx, ay), (mx, by), (bx, by)]
    elif len(pts) == 2 and cells[0][1] == cells[1][1] and abs(ax - bx) > 1e-9:
        my = (pts[0][1] + pts[1][1]) / 2
        my = grid.to_point(grid.to_cell(pts[0][0], my))[1]
        line = [(ax, ay), (ax, my), (bx, my), (bx, by)]
    else:
        # slide the first run through a, the last run through b
        if cells[0][0] == cells[1][0]:  # first run horizontal: share a's y
            pts[0][1] = pts[1][1] = ay
        else:  # vertical: share a's x
            pts[0][0] = pts[1][0] = ax
        if cells[-1][0] == cells[-2][0]:
            pts[-1][1] = pts[-2][1] = by
        else:
            pts[-1][0] = pts[-2][0] = bx
        pts[0], pts[-1] = [ax, ay], [bx, by]
        line = [tuple(p) for p in pts]
    # drop repeated points and points in the middle of a straight run
    out = [line[0]]
    for p in line[1:]:
        if abs(p[0] - out[-1][0]) < 1e-9 and abs(p[1] - out[-1][1]) < 1e-9:
            continue
        if len(out) >= 2:
            (x0, y0), (x1, y1) = out[-2], out[-1]
            if (abs(x0 - x1) < 1e-9 and abs(x1 - p[0]) < 1e-9) or (abs(y0 - y1) < 1e-9 and abs(y1 - p[1]) < 1e-9):
                if (x1 - x0) * (p[0] - x1) + (y1 - y0) * (p[1] - y1) > 0:  # same direction
                    out[-1] = p
                    continue
        out.append(p)
    return out


def route(grid, a, b, **search):
    """Axis-aligned cable polyline (canvas units) between two shapely Points, or None."""
    found = route_cells(grid, a, b, **search)
    return None if found is None else found[0]


def route_cells(grid, a, b, occupied=None, start_heading=-1, end_heading=-1):
    """(polyline, cells) between two shapely Points, or None.

    With cable already laid (`occupied`), the search runs in scipy's compiled
    Dijkstra on the re-priced state graph (fast_path); otherwise in find_path.
    Both use the same costs.
    """
    start, goal = grid.nearest_free(a.x, a.y), grid.nearest_free(b.x, b.y)
    if occupied is None:
        path = find_path(grid, start, goal, start_heading=start_heading, end_heading=end_heading)
    else:
        path = fast_path(grid, start, goal, occupied, start_heading, end_heading)
    if path is None:
        return None
    return attach(grid, corners(path), (a.x, a.y), (b.x, b.y)), path


def fast_path(grid, start, goal, occupied, start_heading=-1, end_heading=-1):
    """Same answer as find_path(..., occupied=...), computed by scipy's Dijkstra."""
    if start == goal:
        return [start]
    graph = grid.priced_graph(occupied)
    cols = grid.cols
    s = (start[0] * cols + start[1]) * 4
    sources = [s + h for h in range(4)] if start_heading == -1 else [s + start_heading]
    dist, pred, _ = dijkstra(graph, directed=True, indices=sources, min_only=True, return_predecessors=True)
    g = (goal[0] * cols + goal[1]) * 4
    finish = [dist[g + h] + (grid.bend_cost if end_heading not in (-1, h) else 0) for h in range(4)]
    h = int(np.argmin(finish))
    if not np.isfinite(finish[h]):
        return None
    state, path = g + h, []
    while state >= 0:
        cell = state // 4
        path.append((cell // cols, cell % cols))
        state = pred[state]
    return path[::-1]


if __name__ == "__main__":
    from validate import count_bends

    count = int(sys.argv[1]) if len(sys.argv) > 1 else 10
    OUT.mkdir(exist_ok=True)
    plans = load_plans(DATA / "ResPlan.pkl", DATA / "split.json")[:count]

    summary, timings = Counter(), []
    print(f'{"plan":>6} {"grid":>9} {"routes":>6} {"metres":>7} {"bends":>5} {"ms/route":>8}  result')
    for plan in plans:
        scale = plan_scale(plan)
        grid = Grid(plan)
        G = passage_graph(plan)
        rooms = eligible_rooms(G, scale)
        devices = place_devices(rooms, plan)
        confirm_passages(G, grid, {k: grid.nearest_free(p.x, p.y) for k, p in devices.items()})
        ids = set(devices)

        # One route per passage between two eligible rooms: each must use that door/gap.
        pairs = [(u, v) for u, v in G.edges if u in ids and v in ids]
        lines, problems, metres, total_bends = [], [], 0.0, 0
        t0 = time.perf_counter()
        for u, v in pairs:
            line = route(grid, devices[u], devices[v])
            if line is None:
                problems.append(f"{u}->{v} unreachable")
                continue
            lines.append(line)
            metres += LineString(line).length / scale
            total_bends += count_bends(line)
            failed = [name for name, ok, _ in check_route(plan, line) if not ok]
            if failed:
                problems.append(f"{u}->{v}: " + ", ".join(failed))
        ms = (time.perf_counter() - t0) * 1000 / max(len(pairs), 1)
        timings.append(ms)

        summary["routes"] += len(pairs)
        summary["route problems"] += len(problems)
        print(f'{plan["id"]:>6} {grid.rows:>4}x{grid.cols:<4} {len(pairs):>6} {metres:>7.1f} '
              f"{total_bends:>5} {ms:>8.0f}  " + ("; ".join(problems) or "ok"))

        if count <= 50:
            ax = plot_plan(plan, legend=False)
            ax.imshow(~grid.free, cmap="Greys", alpha=0.12, origin="lower", zorder=2,
                      extent=(grid.x0, grid.x0 + grid.cols * CELL, grid.y0, grid.y0 + grid.rows * CELL))
            for line in lines:
                xs, ys = zip(*line)
                ax.plot(xs, ys, color="#c0392b", lw=1.8, zorder=4)
            for p in devices.values():
                ax.scatter([p.x], [p.y], s=50, c="black", zorder=5)
            ax.set_title(f'plan {plan["id"]} · {len(lines)} routes · {metres:.1f} m · {total_bends} bends',
                         fontsize=10)
            ax.figure.savefig(OUT / f'routes_{plan["id"]}.png', dpi=130, bbox_inches="tight")
            plt.close(ax.figure)

    timings.sort()
    print(f'\n{summary["routes"]} routes, {summary["route problems"]} with problems; '
          f"median {timings[len(timings) // 2]:.0f} ms per route")
