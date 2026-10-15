// Talking to the cable solver through the dev server (POST /api/cable/solve,
// scripts/resplan/vitePlugin.ts), and turning the plan drawn in the editor
// into the solver's input.
import type { Opening, PlanWall } from "../store";
import { PX_PER_METER } from "../units";
import { openingPlacement } from "../2d/planGeometry";
import type { Point } from "../2d/planGeometry";
import { isCablePlan } from "./cablePlan";
import type { CablePlan, CableShape, XY } from "./cablePlan";

export type SolveRequest =
    | { datasetId: string; index: number } // a plan from the uploaded ResPlan file
    | { plan: unknown; move?: { hub_id: string; x: number; y: number } }; // re-solve / move a hub

export async function solveCable(request: SolveRequest): Promise<CablePlan> {
    let res: Response;
    try {
        res = await fetch("/api/cable/solve", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(request),
        });
    } catch {
        throw new Error("Couldn't reach the dev server. Is `npm run dev` running?");
    }
    let body: unknown;
    try {
        body = await res.json();
    } catch {
        throw new Error(res.status === 404
            ? "The cable solver isn't available here: run the app with `npm run dev`."
            : `The server sent an unexpected reply (HTTP ${res.status}).`);
    }
    const data = body as { error?: string; status?: string; reason?: string };
    if (!res.ok || data.error) throw new Error(data.error ?? `Solving failed (HTTP ${res.status}).`);
    if (!isCablePlan(body)) {
        // A plan with no geometry at all comes back as just a status and reason.
        throw new Error(data.reason ? `Can't solve this plan: ${data.reason}` : "The solver's reply isn't a plan.");
    }
    return body;
}

// ---------------------------------------------------------------------------
// The editor's drawing -> the solver's plan
// ---------------------------------------------------------------------------

// The 3D walls are 10 cm thick (store.buildRoomFromPlan), so the solver uses
// the same: cable can't run inside a wall.
const WALL_M = 0.1;

// Plan pixels (y down) -> solver metres (y up), with the plan's own origin kept:
// the result carries frame {x0: 0, y0: 0}, so it lands back on the drawing.
const toMetres = ([px, py]: Point): XY => [px / PX_PER_METER, -py / PX_PER_METER];

// A band `width` metres wide along a to b (both in metres).
function band(a: XY, b: XY, width: number): CableShape {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const [ux, uy] = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    const [nx, ny] = [-uy * (width / 2), ux * (width / 2)];
    return { outer: [[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]], holes: [] };
}

/**
 * The solver's input for the plan drawn in the editor.
 *
 * Only the wall centre lines are sent: the solver finds the rooms itself, as
 * every closed loop of walls (rectangles, wall chains, any shape; rooms side
 * by side share a wall). Each room gets one node; doors connect rooms;
 * windows block cable, as in the dataset.
 */
export function drawnPlanToSolverJson(points: Point[], walls: PlanWall[], openings: Opening[]): { plan: object } | { error: string } {
    const segments: [Point, Point][] = walls.map((w) => [w.a, w.b]);
    // The freehand outline is one implicit loop (as store.buildRoomFromPlan reads it).
    for (let i = 0; i + 1 < points.length; i++) segments.push([points[i], points[i + 1]]);
    if (points.length >= 3) segments.push([points[points.length - 1], points[0]]);
    if (segments.length < 3) return { error: "Draw a closed room first (Rectangle or Wall tool), then route it." };

    const shapes = (kind: Opening["kind"]) =>
        openings.flatMap((o) => {
            const place = o.kind === kind ? openingPlacement(o, walls) : null;
            if (!place) return [];
            const half = (o.width / 2) * PX_PER_METER;
            const a = toMetres([place.center[0] - place.dir[0] * half, place.center[1] - place.dir[1] * half]);
            const b = toMetres([place.center[0] + place.dir[0] * half, place.center[1] + place.dir[1] * half]);
            // A little thicker than the wall, so it clearly touches the rooms on both sides.
            return [band(a, b, WALL_M + 0.04)];
        });

    return {
        plan: {
            plan_id: 0,
            units: "m",
            wall_depth_m: WALL_M,
            frame: { x0: 0, y0: 0 },
            source: { kind: "drawn" },
            rooms: [],
            wall_lines: segments.map(([a, b]) => [toMetres(a), toMetres(b)]),
            walls: [],
            doors: shapes("door"),
            front_doors: [],
            windows: shapes("window"),
            nodes: [],
            hubs: [],
        },
    };
}
