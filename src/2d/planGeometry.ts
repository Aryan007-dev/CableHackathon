// Pure geometry for the 2D plan: no React, no store writes. Everything is in
// plan pixels unless a name says metres.

import { OPENING_DEFAULTS } from "../store";
import type { Opening, PlanFurniture, PlanWall, PlanWire, PlanWireConnection } from "../store";
import { PX_PER_METER } from "../units";
import { CLOSE_DIST, HIT_PX, WALL_EDGE_WIDTH } from "./planConstants";

export type Point = [number, number];

export type Rectangle = {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
};

export const snap = (v: number, step: number) => Math.round(v / step) * step;

// Corners are matched by coordinates: walls that meet share a corner, and a
// closed freehand loop repeats its first corner at the end.
export const pointKey = (p: Point) => `${p[0]},${p[1]}`;

export const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export const distanceToSegment = (p: Point, a: Point, b: Point) => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const lenSq = dx * dx + dy * dy;
    const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq));
    return distance(p, [a[0] + t * dx, a[1] + t * dy]);
};

// Even-odd ray cast. The plan is always built as a closed loop, so treat
// the freehand outline as closed even before the last click.
export const insidePolygon = (p: Point, poly: Point[]) => {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, yi] = poly[i];
        const [xj, yj] = poly[j];
        if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) {
            inside = !inside;
        }
    }
    return inside;
};

export const normalizeAngle = (degrees: number) => ((degrees % 360) + 360) % 360;

// A new freehand click that lands on an existing corner reuses that corner.
export const resolvePoint = (x: number, y: number, points: Point[]): Point => {
    for (const p of points) {
        if (Math.hypot(p[0] - x, p[1] - y) < CLOSE_DIST) {
            return p;
        }
    }

    return [x, y];
};

export function snapWireEndpoint(
    target: Point,
    walls: PlanWall[],
    wires: PlanWire[],
    excludeWireIds?: ReadonlySet<string>,
    tolerance = CLOSE_DIST,
): { point: Point; connection?: PlanWireConnection } | null {
    const candidates: { point: Point; connection: PlanWireConnection; distance: number }[] = [];
    const consider = (point: Point, connection: PlanWireConnection) => {
        const d = distance(target, point);
        if (d <= tolerance) candidates.push({ point, connection, distance: d });
    };

    walls.forEach((wall) => {
        consider(wall.a, { kind: "wall", wallId: wall.id, end: "a" });
        consider(wall.b, { kind: "wall", wallId: wall.id, end: "b" });
    });
    wires.forEach((wire) => {
        if (excludeWireIds?.has(wire.id)) return;
        consider(wire.start, { kind: "wire", wireId: wire.id, end: "start" });
        consider(wire.end, { kind: "wire", wireId: wire.id, end: "end" });
    });

    candidates.sort((a, b) =>
        a.distance - b.distance ||
        (a.connection.kind === "wire" ? -1 : 1)
    );
    const best = candidates[0];
    return best ? { point: best.point, connection: best.connection } : null;
}

// If the polyline's four points are the corners of an axis-aligned rectangle,
// reuse the same visual renderer as the Rectangle tool. The original points
// remain unchanged for the 3D room conversion.
export const rectangleFromPoints = (points: Point[]): Rectangle | null => {
    const corners = points.length === 5 &&
        points[0][0] === points[4][0] &&
        points[0][1] === points[4][1]
        ? points.slice(0, 4)
        : points;

    if (corners.length !== 4) return null;

    const left = Math.min(...corners.map(([x]) => x));
    const right = Math.max(...corners.map(([x]) => x));
    const top = Math.min(...corners.map(([, y]) => y));
    const bottom = Math.max(...corners.map(([, y]) => y));

    const expected = new Set([
        `${left},${top}`,
        `${right},${top}`,
        `${right},${bottom}`,
        `${left},${bottom}`,
    ]);
    const actual = new Set(corners.map(([x, y]) => `${x},${y}`));

    if (expected.size !== actual.size || [...expected].some((p) => !actual.has(p))) {
        return null;
    }

    return { x1: left, y1: top, x2: right, y2: bottom };
};

// Walls drawn together by the Rectangle tool share a roomId. While all four
// still form an axis-aligned rectangle the room is drawn whole (fill, area,
// dimension lines); once a wall is moved off or deleted, its walls are drawn
// one by one instead.
const intactRoomRectangle = (walls: PlanWall[]): Rectangle | null => {
    if (walls.length !== 4) return null;

    const xs = walls.flatMap((w) => [w.a[0], w.b[0]]);
    const ys = walls.flatMap((w) => [w.a[1], w.b[1]]);
    const left = Math.min(...xs);
    const right = Math.max(...xs);
    const top = Math.min(...ys);
    const bottom = Math.max(...ys);
    if (left === right || top === bottom) return null;

    const edgeKey = (p: Point, q: Point) => [pointKey(p), pointKey(q)].sort().join("|");
    const expected = new Set([
        edgeKey([left, top], [right, top]),
        edgeKey([right, top], [right, bottom]),
        edgeKey([right, bottom], [left, bottom]),
        edgeKey([left, bottom], [left, top]),
    ]);
    const actual = new Set(walls.map((w) => edgeKey(w.a, w.b)));

    return actual.size === 4 && [...actual].every((k) => expected.has(k))
        ? { x1: left, y1: top, x2: right, y2: bottom }
        : null;
};

export type Room = { rectangle: Rectangle; wallIndexes: number[] };

// Rectangle rooms whose four walls are still intact.
export const findRooms = (walls: PlanWall[]): Room[] => {
    const wallsByRoom = new Map<string, number[]>();
    walls.forEach((w, i) => {
        if (w.roomId) wallsByRoom.set(w.roomId, [...(wallsByRoom.get(w.roomId) ?? []), i]);
    });

    const rooms: Room[] = [];
    for (const wallIndexes of wallsByRoom.values()) {
        const rectangle = intactRoomRectangle(wallIndexes.map((i) => walls[i]));
        if (rectangle) rooms.push({ rectangle, wallIndexes });
    }
    return rooms;
};

// Where an opening sits on the plan: its centre, its wall's unit direction,
// the rotation to draw it with (degrees), and its width in plan pixels.
export type OpeningPlacement = { center: Point; dir: Point; angle: number; widthPx: number };

export const openingPlacement = (o: Opening, walls: PlanWall[]): OpeningPlacement | null => {
    const w = walls.find((wall) => wall.id === o.wallId);
    if (!w) return null;
    const len = distance(w.a, w.b);
    if (len === 0) return null;
    const dir: Point = [(w.b[0] - w.a[0]) / len, (w.b[1] - w.a[1]) / len];
    const along = o.offset * PX_PER_METER;
    return {
        center: [w.a[0] + dir[0] * along, w.a[1] + dir[1] * along],
        dir,
        angle: (Math.atan2(dir[1], dir[0]) * 180) / Math.PI,
        widthPx: o.width * PX_PER_METER,
    };
};

// A wall's length split at its doors and windows, for the
// "wall | opening | wall" dimension labels. A wall with none is one piece.
export const wallLengthPieces = (w: PlanWall, openings: Opening[]): [Point, Point][] => {
    const len = distance(w.a, w.b);
    if (len === 0) return [];
    const at = (px: number): Point => [
        w.a[0] + ((w.b[0] - w.a[0]) * px) / len,
        w.a[1] + ((w.b[1] - w.a[1]) * px) / len,
    ];
    const cuts = openings
        .filter((o) => o.wallId === w.id)
        .flatMap((o) => [(o.offset - o.width / 2) * PX_PER_METER, (o.offset + o.width / 2) * PX_PER_METER])
        .sort((p, q) => p - q);
    const stops = [0, ...cuts, len];
    return stops.slice(1).map((stop, i): [Point, Point] => [at(stops[i]), at(stop)]);
};

// Door/Window tool: the nearest wall to the cursor, and where along it the
// new opening's centre lands (snapped, and kept fully on the wall).
export type OpeningSpot = { wallId: string; offset: number; blocked: boolean };

export const findOpeningSpot = (
    p: Point,
    kind: Opening["kind"],
    walls: PlanWall[],
    openings: Opening[],
    scale: number,
    snapPx: number
): OpeningSpot | null => {
    const reach = (HIT_PX * 2) / scale + WALL_EDGE_WIDTH;
    let best: { wall: PlanWall; t: number; dist: number } | null = null;

    for (const wall of walls) {
        const dist = distanceToSegment(p, wall.a, wall.b);
        if (dist > reach || (best && dist >= best.dist)) continue;
        const dx = wall.b[0] - wall.a[0];
        const dy = wall.b[1] - wall.a[1];
        const lenSq = dx * dx + dy * dy;
        if (lenSq === 0) continue;
        // Projection: how far along the wall (0..1) the cursor's closest point is.
        const t = Math.max(0, Math.min(1, ((p[0] - wall.a[0]) * dx + (p[1] - wall.a[1]) * dy) / lenSq));
        best = { wall, t, dist };
    }

    if (!best) return null;
    const found = best;
    const { width } = OPENING_DEFAULTS[kind];
    const length = distance(found.wall.a, found.wall.b) / PX_PER_METER;
    if (length < width) return null;

    const step = snapPx / PX_PER_METER;
    const offset = Math.min(Math.max(Math.round((found.t * length) / step) * step, width / 2), length - width / 2);
    const blocked = openings.some(
        (o) => o.wallId === found.wall.id && Math.abs(o.offset - offset) < (o.width + width) / 2
    );

    return { wallId: found.wall.id, offset, blocked };
};

// A placed piece's footprint on the plan: its four corners, rotated with it.
// SVG's rotate() turns clockwise on screen, and this matches it.
export const furnitureCorners = (f: PlanFurniture): Point[] => {
    const halfWidth = (f.width * PX_PER_METER) / 2;
    const halfDepth = (f.depth * PX_PER_METER) / 2;
    const rad = (f.rotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    return ([[-halfWidth, -halfDepth], [halfWidth, -halfDepth], [halfWidth, halfDepth], [-halfWidth, halfDepth]] as Point[])
        .map(([x, y]) => [f.x + x * cos - y * sin, f.y + x * sin + y * cos]);
};

// Is p on the piece? Undo its rotation, and it's a plain box test.
export const insideFurniture = (p: Point, f: PlanFurniture) => {
    const rad = (-f.rotation * Math.PI) / 180;
    const dx = p[0] - f.x;
    const dy = p[1] - f.y;
    const localX = dx * Math.cos(rad) - dy * Math.sin(rad);
    const localY = dx * Math.sin(rad) + dy * Math.cos(rad);
    return Math.abs(localX) <= (f.width * PX_PER_METER) / 2 && Math.abs(localY) <= (f.depth * PX_PER_METER) / 2;
};

// A piece's rotate knob: on a short stalk off its back edge, 24 screen pixels
// out at any zoom.
export const rotateHandlePoints = (piece: PlanFurniture, scale: number): { base: Point; knob: Point } => {
    const rad = (piece.rotation * Math.PI) / 180;
    const back = (piece.depth * PX_PER_METER) / 2;
    // The point `dist` behind the centre, turned with the piece.
    const behind = (dist: number): Point => [piece.x + dist * Math.sin(rad), piece.y - dist * Math.cos(rad)];
    return { base: behind(back), knob: behind(back + 24 / scale) };
};

export const planRotationToQuat = (degrees:number):[number,number,number,number]=>{
    const psi =  -degrees * Math.PI / 180;
    return [
    0,
    Math.sin(psi / 2),
    0,
    Math.cos(psi / 2),
  ]

}
export function footprintsOverlap(a: Point[], b: Point[]): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const [x1, z1] = poly[i];
      const [x2, z2] = poly[(i + 1) % poly.length];
      const nx = -(z2 - z1), nz = x2 - x1;
      let minA = Infinity, maxA = -Infinity, minB = Infinity, maxB = -Infinity;
      for (const [x, z] of a) { const p = x * nx + z * nz; minA = Math.min(minA, p); maxA = Math.max(maxA, p); }
      for (const [x, z] of b) { const p = x * nx + z * nz; minB = Math.min(minB, p); maxB = Math.max(maxB, p); }
      if (maxA < minB || maxB < minA) return false;
    }
  }
  return true;
}
