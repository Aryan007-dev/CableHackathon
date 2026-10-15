// The 2D plan written out in plain text — the AI's eyes on it.
//
// Everything on the plan is stored in PLAN PIXELS, which mean nothing to a
// language model, so every position written here goes through `m()`. Careful:
// a PlanFurniture mixes units — x/y are pixels, but width/depth are already
// metres, so those must NOT be converted.
import { useEditor } from "../store";
import type { PlanFurniture } from "../store";
import { PX_PER_METER } from "../units";
import { findRooms, openingPlacement } from "../2d/planGeometry";
import type { Point, Room } from "../2d/planGeometry";
import { SYMBOL_BY_ID } from "../2d/symbolLibrary";

const m = (px: number) => (px / PX_PER_METER).toFixed(1);

// findRooms builds its rectangle with x1/y1 as the smaller values, so no
// min/max is needed here. Both furniture and openings use this: each reduces to
// "is this point in that box". Boundaries count as inside, which is what puts a
// door — whose centre sits exactly on a wall — in the room it belongs to.
const inside = (p: Point, r: Room["rectangle"]) =>
    p[0] >= r.x1 && p[0] <= r.x2 && p[1] >= r.y1 && p[1] <= r.y2;

export function describePlan(): string {
    const { planWalls, planFurniture, openings } = useEditor.getState().doc;

    if (planWalls.length === 0 && planFurniture.length === 0) {
        return "The 2D plan is empty - no walls or furniture yet.";
    }

    const rooms = findRooms(planWalls);
    const lines: string[] = [];

    // What each room accounted for, so nothing is silently left out of the
    // description just because it sits outside every rectangle.
    const seenFurniture = new Set<string>();
    const seenOpenings = new Set<string>();
    const seenWalls = new Set<number>();

    // Each opening's centre, worked out once rather than per room.
    const centers = new Map<string, Point>();
    for (const o of openings) {
        const place = openingPlacement(o, planWalls);
        if (place) centers.set(o.id, place.center);
    }

    const furnitureLine = (f: PlanFurniture) => {
        const label = SYMBOL_BY_ID[f.symbolId]?.label ?? f.symbolId;
        return `  ${label} (${f.symbolId}) at (${m(f.x)}, ${m(f.y)}), ${f.width}m x ${f.depth}m, rotated ${f.rotation} degrees`;
    };

    rooms.forEach((room, i) => {
        const r = room.rectangle;
        for (const w of room.wallIndexes) seenWalls.add(w);

        lines.push(
            `Room ${i + 1}: ${m(r.x2 - r.x1)}m wide x ${m(r.y2 - r.y1)}m deep, ` +
            `corners (${m(r.x1)}, ${m(r.y1)}) to (${m(r.x2)}, ${m(r.y2)})`
        );
        const headerAt = lines.length;

        for (const f of planFurniture) {
            if (seenFurniture.has(f.id) || !inside([f.x, f.y], r)) continue;
            seenFurniture.add(f.id);
            lines.push(furnitureLine(f));
        }

        for (const o of openings) {
            const c = centers.get(o.id);
            if (!c || seenOpenings.has(o.id) || !inside(c, r)) continue;
            seenOpenings.add(o.id);
            lines.push(`  ${o.kind} at (${m(c[0])}, ${m(c[1])}), ${o.width}m wide`);
        }

        if (lines.length === headerAt) lines.push("  (nothing in it yet)");
    });

    // findRooms only recognises exactly four axis-aligned walls with matching
    // corners, so L-shaped and freehand rooms produce NO rooms at all. Without
    // this the model would be told an empty plan when walls clearly exist.
    const looseWalls = planWalls.filter((_, i) => !seenWalls.has(i));
    if (looseWalls.length > 0) {
        lines.push(`Walls not forming a rectangular room (${looseWalls.length}):`);
        for (const w of looseWalls) {
            lines.push(`  wall from (${m(w.a[0])}, ${m(w.a[1])}) to (${m(w.b[0])}, ${m(w.b[1])})`);
        }
    }

    const looseFurniture = planFurniture.filter((f) => !seenFurniture.has(f.id));
    if (looseFurniture.length > 0) {
        lines.push("Furniture not inside any room:");
        for (const f of looseFurniture) lines.push(furnitureLine(f));
    }

    const looseOpenings = openings.filter((o) => !seenOpenings.has(o.id));
    if (looseOpenings.length > 0) {
        lines.push("Doors/windows not inside any room:");
        for (const o of looseOpenings) {
            const c = centers.get(o.id);
            lines.push(c ? `  ${o.kind} at (${m(c[0])}, ${m(c[1])})` : `  ${o.kind} (no wall)`);
        }
    }

    return lines.join("\n");
}
