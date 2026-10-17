// The Select tool's model: what can be picked, what's under the cursor, and
// how selected things move, rotate, flip and get deleted. Pure functions that
// take a plan snapshot and return a new one; the component commits the result.
import { fitOpenings } from "../store";
import { removePlanFurnitureItems } from "./electricalPlan";
import type { Opening, PlanFurniture, PlanWall } from "../store";
import { PX_PER_METER } from "../units";
import { HIT_PX, WALL_EDGE_WIDTH, WALL_WIDTH } from "./planConstants";
import {
    distance,
    distanceToSegment,
    furnitureCorners,
    insideFurniture,
    insidePolygon,
    normalizeAngle,
    openingPlacement,
    pointKey,
} from "./planGeometry";
import type { Point, Room } from "./planGeometry";

// Everything on the 2D plan at one moment: the store's version, or the live
// preview while something is being dragged.
export type PlanSnapshot = {
    points: Point[];
    walls: PlanWall[];
    openings: Opening[];
    furniture: PlanFurniture[];
};

// One thing the Select tool can pick. Rectangle rooms are stored as four
// independent walls, so every wall and every wall corner is its own item.
// The freehand outline is picked by corner (point) or by wall (segment from
// points[index - 1] to points[index]).
export type PlanItem =
    | { kind: "wall"; index: number }
    | { kind: "wallEnd"; index: number; end: "a" | "b" }
    | { kind: "point"; index: number }
    | { kind: "segment"; index: number }
    | { kind: "opening"; id: string }
    | { kind: "furniture"; id: string };

export const itemKey = (item: PlanItem): string => {
    if (item.kind === "opening" || item.kind === "furniture") return `${item.kind}:${item.id}`;
    if (item.kind === "wallEnd") return `wallEnd:${item.index}:${item.end}`;
    return `${item.kind}:${item.index}`;
};

// Undo/redo can remove selected things out from under the selection.
export const itemExists = (item: PlanItem, plan: PlanSnapshot) => {
    if (item.kind === "opening") return plan.openings.some((o) => o.id === item.id);
    if (item.kind === "furniture") return plan.furniture.some((f) => f.id === item.id);
    if (item.kind === "point") return item.index < plan.points.length;
    if (item.kind === "segment") return item.index > 0 && item.index < plan.points.length;
    return item.index < plan.walls.length;
};

const openingIds = (items: PlanItem[]) =>
    new Set(items.flatMap((item) => (item.kind === "opening" ? [item.id] : [])));

const furnitureIds = (items: PlanItem[]) =>
    new Set(items.flatMap((item) => (item.kind === "furniture" ? [item.id] : [])));

// What's under the cursor for the Select tool, topmost first: doors and
// windows, corners, walls, furniture, then room interiors.
export const hitTest = (w: Point, plan: PlanSnapshot, rooms: Room[], scale: number): PlanItem[] => {
    const { points, walls, openings, furniture } = plan;
    const tol = HIT_PX / scale;

    // Doors and windows sit on top of their wall, so they're checked first.
    // Work in the opening's frame: `along` the wall and `across` it.
    for (let i = openings.length - 1; i >= 0; i--) {
        const place = openingPlacement(openings[i], walls);
        if (!place) continue;
        const rel: Point = [w[0] - place.center[0], w[1] - place.center[1]];
        const along = rel[0] * place.dir[0] + rel[1] * place.dir[1];
        const across = -rel[0] * place.dir[1] + rel[1] * place.dir[0];
        // A door's swing area is clickable too.
        const reach = openings[i].kind === "door" ? place.widthPx : WALL_EDGE_WIDTH / 2 + tol;
        if (Math.abs(along) <= place.widthPx / 2 && Math.abs(across) <= reach) {
            return [{ kind: "opening", id: openings[i].id }];
        }
    }

    for (let i = points.length - 1; i >= 0; i--) {
        if (distance(points[i], w) <= tol) return [{ kind: "point", index: i }];
    }

    for (let i = walls.length - 1; i >= 0; i--) {
        for (const end of ["a", "b"] as const) {
            if (distance(walls[i][end], w) <= tol) return [{ kind: "wallEnd", index: i, end }];
        }
    }

    for (let i = 1; i < points.length; i++) {
        if (distanceToSegment(w, points[i - 1], points[i]) <= tol) return [{ kind: "segment", index: i }];
    }

    // Room walls are drawn as a band WALL_WIDTH thick inside the room outline.
    for (let i = walls.length - 1; i >= 0; i--) {
        if (distanceToSegment(w, walls[i].a, walls[i].b) <= tol + WALL_WIDTH) return [{ kind: "wall", index: i }];
    }

    // Furniture stands on the floor, above room interiors.
    for (let i = furniture.length - 1; i >= 0; i--) {
        if (insideFurniture(w, furniture[i])) return [{ kind: "furniture", id: furniture[i].id }];
    }

    // Inside an intact rectangle room: pick all four of its walls.
    for (let i = rooms.length - 1; i >= 0; i--) {
        const r = rooms[i].rectangle;
        if (w[0] >= r.x1 && w[0] <= r.x2 && w[1] >= r.y1 && w[1] <= r.y2) {
            return rooms[i].wallIndexes.map((index): PlanItem => ({ kind: "wall", index }));
        }
    }

    // Inside the freehand outline: pick all of its walls.
    if (points.length >= 3 && insidePolygon(w, points)) {
        return points.slice(1).map((_, i): PlanItem => ({ kind: "segment", index: i + 1 }));
    }

    return [];
};

// Everything fully inside the box from a to b.
export const itemsInBox = (a: Point, b: Point, plan: PlanSnapshot): PlanItem[] => {
    const minX = Math.min(a[0], b[0]);
    const maxX = Math.max(a[0], b[0]);
    const minY = Math.min(a[1], b[1]);
    const maxY = Math.max(a[1], b[1]);
    const inBox = ([x, y]: Point) => x >= minX && x <= maxX && y >= minY && y <= maxY;
    const items: PlanItem[] = [];

    plan.walls.forEach((w, index) => {
        if (inBox(w.a) && inBox(w.b)) items.push({ kind: "wall", index });
    });

    plan.points.forEach((p, index) => {
        if (!inBox(p)) return;
        items.push({ kind: "point", index });
        if (index > 0 && inBox(plan.points[index - 1])) items.push({ kind: "segment", index });
    });

    plan.openings.forEach((o) => {
        const place = openingPlacement(o, plan.walls);
        if (place && inBox(place.center)) items.push({ kind: "opening", id: o.id });
    });

    plan.furniture.forEach((f) => {
        if (furnitureCorners(f).every(inBox)) items.push({ kind: "furniture", id: f.id });
    });

    return items;
};

// Move selected corners and walls by (dx, dy). Items can overlap (a wall and
// its corner), so first collect WHICH corners move, then move each corner once.
// Walls that share a moved corner stretch to stay connected.
const moveCorners = (items: PlanItem[], points: Point[], walls: PlanWall[], dx: number, dy: number) => {
    const movedPoints = new Set<string>();
    const movedCorners = new Set<string>();

    for (const item of items) {
        if (item.kind === "point") {
            movedPoints.add(pointKey(points[item.index]));
        } else if (item.kind === "segment") {
            movedPoints.add(pointKey(points[item.index - 1]));
            movedPoints.add(pointKey(points[item.index]));
        } else if (item.kind === "wall") {
            movedCorners.add(pointKey(walls[item.index].a));
            movedCorners.add(pointKey(walls[item.index].b));
        } else if (item.kind === "wallEnd") {
            movedCorners.add(pointKey(walls[item.index][item.end]));
        }
    }

    const shift = (p: Point, moved: Set<string>): Point =>
        moved.has(pointKey(p)) ? [p[0] + dx, p[1] + dy] : p;

    return {
        points: points.map((p) => shift(p, movedPoints)),
        walls: walls.map((w) => {
            const a = shift(w.a, movedCorners);
            const b = shift(w.b, movedCorners);
            return a === w.a && b === w.b ? w : { ...w, a, b };
        }),
    };
};

// Selected doors/windows slide along their own wall by the part of the drag
// that runs along it. If their wall is being moved too, they just ride along.
const slideOpenings = (items: PlanItem[], openings: Opening[], walls: PlanWall[], dx: number, dy: number) => {
    const ids = openingIds(items);
    if (ids.size === 0) return openings;
    const movedWallIds = new Set(items.flatMap((item) => (item.kind === "wall" ? [walls[item.index].id] : [])));

    return openings.map((o) => {
        if (!ids.has(o.id) || movedWallIds.has(o.wallId)) return o;
        const w = walls.find((wall) => wall.id === o.wallId);
        const len = w ? distance(w.a, w.b) : 0;
        if (!w || len === 0) return o;
        const along = (dx * (w.b[0] - w.a[0]) + dy * (w.b[1] - w.a[1])) / len;
        return { ...o, offset: o.offset + along / PX_PER_METER };
    });
};

// The plan with the selection dragged by (dx, dy). Openings are shown as
// they'll be saved: kept on their (maybe resized) walls.
export const moveSelection = (items: PlanItem[], plan: PlanSnapshot, dx: number, dy: number): PlanSnapshot => {
    const moved = moveCorners(items, plan.points, plan.walls, dx, dy);
    const slid = slideOpenings(items, plan.openings, plan.walls, dx, dy);
    const ids = furnitureIds(items);

    return {
        ...moved,
        openings: fitOpenings(slid, moved.walls),
        furniture: ids.size === 0
            ? plan.furniture
            : plan.furniture.map((f) => (ids.has(f.id) ? { ...f, x: f.x + dx, y: f.y + dy } : f)),
    };
};

// The plan with the selection deleted. A wall goes on its own; a wall corner
// takes the walls that meet there; a freehand wall removes its end corner, so
// the walls on either side join up (the freehand outline is always one loop).
// Doors and windows on a deleted wall are dropped when the store refits them.
export const deleteItems = (items: PlanItem[], plan: PlanSnapshot): PlanSnapshot => {
    const wallsToRemove = new Set<number>();
    const cornersToRemove = new Set<string>();
    const pointsToRemove = new Set<string>();

    for (const item of items) {
        if (item.kind === "point" || item.kind === "segment") {
            pointsToRemove.add(pointKey(plan.points[item.index]));
        } else if (item.kind === "wall") {
            wallsToRemove.add(item.index);
        } else if (item.kind === "wallEnd") {
            cornersToRemove.add(pointKey(plan.walls[item.index][item.end]));
        }
    }

    const openingsToRemove = openingIds(items);
    const furnitureToRemove = furnitureIds(items);

    return {
        points: plan.points.filter((p) => !pointsToRemove.has(pointKey(p))),
        walls: plan.walls.filter(
            (w, i) =>
                !wallsToRemove.has(i) &&
                !cornersToRemove.has(pointKey(w.a)) &&
                !cornersToRemove.has(pointKey(w.b))
        ),
        openings: plan.openings.filter((o) => !openingsToRemove.has(o.id)),
        furniture: removePlanFurnitureItems(plan.furniture, furnitureToRemove),
    };
};

// Selected doors swing to the other side of their wall. Null when no door or
// window is selected, so the key can do something else.
export const flipDoors = (items: PlanItem[], openings: Opening[]): Opening[] | null => {
    const ids = openingIds(items);
    if (ids.size === 0) return null;
    return openings.map((o) => (ids.has(o.id) && o.kind === "door" ? { ...o, flip: !o.flip } : o));
};

// Selected furniture turns by `step` degrees. Null when no furniture is selected.
export const rotateFurniture = (items: PlanItem[], furniture: PlanFurniture[], step: number): PlanFurniture[] | null => {
    const ids = furnitureIds(items);
    if (ids.size === 0) return null;
    return furniture.map((f) => (ids.has(f.id) ? { ...f, rotation: normalizeAngle(f.rotation + step) } : f));
};

