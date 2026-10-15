// The Select tool's model: what can be picked, what's under the cursor, and
// how selected things move, rotate, flip and get deleted. Pure functions that
// take a plan snapshot and return a new one; the component commits the result.
import { fitOpenings } from "../store";
import type { Opening, PlanFurniture, PlanWall, PlanWire, PlanWireConnection } from "../store";
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
    wires: PlanWire[];
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
    | { kind: "furniture"; id: string }
    | { kind: "wire"; id: string }
    | { kind: "wireEnd"; id: string; end: "start" | "end" };

export const itemKey = (item: PlanItem): string => {
    if (item.kind === "opening" || item.kind === "furniture" || item.kind === "wire") return `${item.kind}:${item.id}`;
    if (item.kind === "wireEnd") return `wireEnd:${item.id}:${item.end}`;
    if (item.kind === "wallEnd") return `wallEnd:${item.index}:${item.end}`;
    return `${item.kind}:${item.index}`;
};

// Undo/redo can remove selected things out from under the selection.
export const itemExists = (item: PlanItem, plan: PlanSnapshot) => {
    if (item.kind === "opening") return plan.openings.some((o) => o.id === item.id);
    if (item.kind === "furniture") return plan.furniture.some((f) => f.id === item.id);
    if (item.kind === "wire" || item.kind === "wireEnd") return plan.wires.some((wire) => wire.id === item.id);
    if (item.kind === "point") return item.index < plan.points.length;
    if (item.kind === "segment") return item.index > 0 && item.index < plan.points.length;
    return item.index < plan.walls.length;
};

const openingIds = (items: PlanItem[]) =>
    new Set(items.flatMap((item) => (item.kind === "opening" ? [item.id] : [])));

const furnitureIds = (items: PlanItem[]) =>
    new Set(items.flatMap((item) => (item.kind === "furniture" ? [item.id] : [])));

const wireIds = (items: PlanItem[]) =>
    new Set(items.flatMap((item) => (item.kind === "wire" ? [item.id] : [])));

function detachWireEndpoint(wires: PlanWire[], wireId: string, end: "start" | "end"): PlanWire[] {
    return wires.map((wire) => {
        const next = { ...wire };
        if (wire.id === wireId) {
            if (end === "start") next.startConnection = undefined;
            else next.endConnection = undefined;
        }
        if (wire.startConnection?.kind === "wire" && wire.startConnection.wireId === wireId && wire.startConnection.end === end) {
            next.startConnection = undefined;
        }
        if (wire.endConnection?.kind === "wire" && wire.endConnection.wireId === wireId && wire.endConnection.end === end) {
            next.endConnection = undefined;
        }
        return next;
    });
}

export function moveWireEndpoint(
    plan: PlanSnapshot,
    wireId: string,
    end: "start" | "end",
    position: Point,
    connection?: PlanWireConnection,
): PlanSnapshot {
    const detached = detachWireEndpoint(plan.wires, wireId, end);
    return {
        ...plan,
        wires: detached.map((wire) => wire.id !== wireId ? wire : end === "start"
            ? { ...wire, start: position, startConnection: connection }
            : { ...wire, end: position, endConnection: connection }),
    };
}

type WireEndpointRef = { wireId: string; end: "start" | "end" };

const endpointKey = ({ wireId, end }: WireEndpointRef) => `${wireId}:${end}`;

export function connectedJunctionEndpoints(wires: PlanWire[], initial: WireEndpointRef): WireEndpointRef[] {
    const endpoints = wires.flatMap((wire) => [
        { wireId: wire.id, end: "start" as const, connection: wire.startConnection },
        { wireId: wire.id, end: "end" as const, connection: wire.endConnection },
    ]);
    const links = new Map<string, Set<string>>();
    const wallAnchors = new Map<string, string[]>();
    endpoints.forEach(({ wireId, end, connection }) => {
        const from = endpointKey({ wireId, end });
        if (connection?.kind === "wall") {
            const anchor = `${connection.wallId}:${connection.end}`;
            wallAnchors.set(anchor, [...(wallAnchors.get(anchor) ?? []), from]);
            return;
        }
        if (connection?.kind !== "wire") return;
        const to = endpointKey({ wireId: connection.wireId, end: connection.end });
        const fromLinks = links.get(from) ?? new Set<string>();
        const toLinks = links.get(to) ?? new Set<string>();
        fromLinks.add(to);
        toLinks.add(from);
        links.set(from, fromLinks);
        links.set(to, toLinks);
    });
    for (const endpointsAtAnchor of wallAnchors.values()) {
        endpointsAtAnchor.forEach((from) => {
            const fromLinks = links.get(from) ?? new Set<string>();
            endpointsAtAnchor.forEach((to) => { if (to !== from) fromLinks.add(to); });
            links.set(from, fromLinks);
        });
    }

    const found = new Map<string, WireEndpointRef>([[endpointKey(initial), initial]]);
    const queue = [initial];
    while (queue.length > 0) {
        const current = queue.shift()!;
        for (const linkedKey of links.get(endpointKey(current)) ?? []) {
            if (found.has(linkedKey)) continue;
            const [wireId, end] = linkedKey.split(":");
            const linked = { wireId, end: end as "start" | "end" };
            found.set(linkedKey, linked);
            queue.push(linked);
        }
    }
    return [...found.values()];
}

export function connectedWireIds(wires: PlanWire[], initialWireId: string): string[] {
    const adjacency = new Map<string, Set<string>>();
    const wallAnchors = new Map<string, Set<string>>();
    const link = (a: string, b: string) => {
        if (a === b) return;
        const neighbors = adjacency.get(a) ?? new Set<string>();
        neighbors.add(b);
        adjacency.set(a, neighbors);
    };
    wires.forEach((wire) => {
        for (const connection of [wire.startConnection, wire.endConnection]) {
            if (connection?.kind === "wire") {
                link(wire.id, connection.wireId);
                link(connection.wireId, wire.id);
            } else if (connection?.kind === "wall") {
                const anchor = `${connection.wallId}:${connection.end}`;
                const attached = wallAnchors.get(anchor) ?? new Set<string>();
                attached.add(wire.id);
                wallAnchors.set(anchor, attached);
            }
        }
    });
    for (const attached of wallAnchors.values()) {
        const ids = [...attached];
        ids.forEach((id) => ids.forEach((other) => link(id, other)));
    }

    const found = new Set([initialWireId]);
    const queue = [initialWireId];
    while (queue.length > 0) {
        const current = queue.shift()!;
        for (const neighbor of adjacency.get(current) ?? []) {
            if (found.has(neighbor)) continue;
            found.add(neighbor);
            queue.push(neighbor);
        }
    }
    return [...found];
}

export function moveWireJunction(
    plan: PlanSnapshot,
    initial: WireEndpointRef,
    position: Point,
    targetConnection?: PlanWireConnection,
): PlanSnapshot {
    const sourceGroup = connectedJunctionEndpoints(plan.wires, initial);
    const sourceSet = new Set(sourceGroup.map(endpointKey));
    const sourceWire = plan.wires.find((wire) => wire.id === initial.wireId);
    if (!sourceWire) return plan;
    const sourcePoint = sourceWire[initial.end];
    const dx = position[0] - sourcePoint[0];
    const dy = position[1] - sourcePoint[1];
    const moved = plan.wires.map((wire) => {
        const startMoves = sourceSet.has(endpointKey({ wireId: wire.id, end: "start" }));
        const endMoves = sourceSet.has(endpointKey({ wireId: wire.id, end: "end" }));
        if (!startMoves && !endMoves) return wire;
        return {
            ...wire,
            start: startMoves ? [wire.start[0] + dx, wire.start[1] + dy] as Point : wire.start,
            end: endMoves ? [wire.end[0] + dx, wire.end[1] + dy] as Point : wire.end,
        };
    });

    const movedEndpoints = [...sourceGroup];
    let root = initial;
    let allEndpoints = movedEndpoints;
    if (targetConnection?.kind === "wire") {
        const targetGroup = connectedJunctionEndpoints(plan.wires, {
            wireId: targetConnection.wireId,
            end: targetConnection.end,
        });
        allEndpoints = [...new Map([...movedEndpoints, ...targetGroup].map((ref) => [endpointKey(ref), ref])).values()];
        root = { wireId: targetConnection.wireId, end: targetConnection.end };
    }

    // Keep one wall anchor only when the junction is still at that wall point.
    // A wall is never translated with its wires.
    const wallAnchor = targetConnection?.kind === "wall"
        ? { ref: initial, connection: targetConnection }
        : allEndpoints.flatMap((ref) => {
            const wire = moved.find((candidate) => candidate.id === ref.wireId);
            const connection = wire?.[`${ref.end}Connection`];
            if (connection?.kind !== "wall") return [];
            const wall = plan.walls.find((candidate) => candidate.id === connection.wallId);
            const wallPoint = wall?.[connection.end];
            return wallPoint && wallPoint[0] === position[0] && wallPoint[1] === position[1]
                ? [{ ref, connection }]
                : [];
        })[0];
    if (wallAnchor) root = wallAnchor.ref;
    const preservedWall = wallAnchor?.connection;
    const allSet = new Set(allEndpoints.map(endpointKey));

    const wires = moved.map((wire) => {
        const atStart = allSet.has(endpointKey({ wireId: wire.id, end: "start" }));
        const atEnd = allSet.has(endpointKey({ wireId: wire.id, end: "end" }));
        if (!atStart && !atEnd) return wire;
        const connectionFor = (end: "start" | "end") => {
            const isRoot = wire.id === root.wireId && end === root.end;
            if (isRoot) return preservedWall?.kind === "wall" ? preservedWall : undefined;
            return { kind: "wire" as const, wireId: root.wireId, end: root.end };
        };
        return {
            ...wire,
            startConnection: atStart ? connectionFor("start") : wire.startConnection,
            endConnection: atEnd ? connectionFor("end") : wire.endConnection,
        };
    });

    return { ...plan, wires };
}

// What's under the cursor for the Select tool, topmost first: doors and
// windows, corners, walls, furniture, then room interiors.
export const hitTest = (w: Point, plan: PlanSnapshot, rooms: Room[], scale: number, preferredWireId?: string): PlanItem[] => {
    const { points, walls, openings, furniture } = plan;
    const tol = HIT_PX / scale;

    // Explicit endpoints win over corners and all segment/body hits.
    const endpointWireOrder = preferredWireId
        ? [...plan.wires.filter((wire) => wire.id === preferredWireId), ...plan.wires.filter((wire) => wire.id !== preferredWireId).reverse()]
        : [...plan.wires].reverse();
    for (const wire of endpointWireOrder) {
        if (distance(wire.start, w) <= tol) return [{ kind: "wireEnd", id: wire.id, end: "start" }];
        if (distance(wire.end, w) <= tol) return [{ kind: "wireEnd", id: wire.id, end: "end" }];
    }

    for (let i = walls.length - 1; i >= 0; i--) {
        for (const end of ["a", "b"] as const) {
            if (distance(walls[i][end], w) <= tol) return [{ kind: "wallEnd", index: i, end }];
        }
    }

    for (let i = points.length - 1; i >= 0; i--) {
        if (distance(points[i], w) <= tol) return [{ kind: "point", index: i }];
    }

    for (let i = plan.wires.length - 1; i >= 0; i--) {
        const wire = plan.wires[i];
        if (distanceToSegment(w, wire.start, wire.end) <= tol + 2) return [{ kind: "wire", id: wire.id }];
    }

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

    plan.wires.forEach((wire) => {
        if (inBox(wire.start) && inBox(wire.end)) items.push({ kind: "wire", id: wire.id });
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
    const selectedWireIds = wireIds(items);
    const wireEnds = items.filter((item): item is Extract<PlanItem, { kind: "wireEnd" }> => item.kind === "wireEnd");
    const endMoves = new Map<string, Set<"start" | "end">>();
    wireEnds.forEach(({ id, end }) => {
        const ends = endMoves.get(id) ?? new Set<"start" | "end">();
        ends.add(end);
        endMoves.set(id, ends);
    });
    let wires = plan.wires.map((wire) => {
        const ends = endMoves.get(wire.id);
        const moveStart = selectedWireIds.has(wire.id) || ends?.has("start");
        const moveEnd = selectedWireIds.has(wire.id) || ends?.has("end");
        if (!moveStart && !moveEnd) return wire;
        return {
            ...wire,
            start: moveStart ? [wire.start[0] + dx, wire.start[1] + dy] as Point : wire.start,
            end: moveEnd ? [wire.end[0] + dx, wire.end[1] + dy] as Point : wire.end,
            startConnection: moveStart
                ? wire.startConnection?.kind === "wire" && selectedWireIds.has(wire.startConnection.wireId) ? wire.startConnection : undefined
                : wire.startConnection,
            endConnection: moveEnd
                ? wire.endConnection?.kind === "wire" && selectedWireIds.has(wire.endConnection.wireId) ? wire.endConnection : undefined
                : wire.endConnection,
        };
    });
    for (const [id, ends] of endMoves) {
        for (const end of ends) wires = detachWireEndpoint(wires, id, end);
    }
    return {
        ...moved,
        openings: fitOpenings(slid, moved.walls),
        furniture: ids.size === 0
            ? plan.furniture
            : plan.furniture.map((f) => (ids.has(f.id) ? { ...f, x: f.x + dx, y: f.y + dy } : f)),
        wires,
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
    const wiresToRemove = new Set(items.flatMap((item) =>
        item.kind === "wire" || item.kind === "wireEnd" ? [item.id] : []
    ));
    let wires = plan.wires.filter((wire) => !wiresToRemove.has(wire.id));
    for (const id of wiresToRemove) {
        wires = detachWireEndpoint(detachWireEndpoint(wires, id, "start"), id, "end");
    }

    return {
        points: plan.points.filter((p) => !pointsToRemove.has(pointKey(p))),
        walls: plan.walls.filter(
            (w, i) =>
                !wallsToRemove.has(i) &&
                !cornersToRemove.has(pointKey(w.a)) &&
                !cornersToRemove.has(pointKey(w.b))
        ),
        openings: plan.openings.filter((o) => !openingsToRemove.has(o.id)),
        furniture: plan.furniture.filter((f) => !furnitureToRemove.has(f.id)),
        wires,
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

