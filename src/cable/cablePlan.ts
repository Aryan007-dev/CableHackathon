// A solved Cable Ring plan, as the solver writes it (solver/cable_api.py):
// from the cable menu (public/cable-plans/<id>.json), from a plan picked in
// the ResPlan import, or from the plan drawn in the editor. Shown, not edited,
// except that a hub can be dragged (the solver then re-routes).
//
// The file uses the solver's axes: metres, y UP. The editor's plan runs y
// DOWN (SVG), and 3D uses z for the plan's y, so every point goes through
// toPlan / toScene below and nowhere else.
import { PX_PER_METER } from "../units.ts";

export type XY = [number, number];

// A polygon: its outline plus any holes, each a list of corners (not closed).
export interface CableShape {
    outer: XY[];
    holes: XY[][];
}

export type RoomKind = "living" | "bedroom" | "kitchen" | "bathroom" | "storage" | "stair" | "balcony";

export interface CableRoom {
    kind: RoomKind;
    label: string; // "Bedroom 2"
    area_m2: number;
    label_at: XY; // a point well inside the room, for its label
    shape: CableShape;
    room_id: string | null; // "R03" for rooms that get a node, null otherwise
    hub_id: string | null; // the hub serving it
}

export interface CableNode {
    node_id: string;
    room_id: string;
    x: number;
    y: number;
}

export interface SolverDeviceDetail extends CableNode {
    roomKind: RoomKind | null;
    roomLabel: string | null;
    hubId: string | null;
    sequenceNumber: number | null;
}

const ROOM_KIND_LABELS: Record<RoomKind, string> = {
    living: "Living room",
    bedroom: "Bedroom",
    kitchen: "Kitchen",
    bathroom: "Bathroom",
    storage: "Storage room",
    stair: "Stair",
    balcony: "Balcony",
};

export const solverDeviceTypeLabel = (kind: RoomKind | null) => `Solver device · ${kind ? ROOM_KIND_LABELS[kind] : "unassigned room"}`;

export interface CableHub {
    hub_id: string;
    room_id: string;
    x: number;
    y: number;
    assigned_rooms?: string[];
    sequence: string[]; // ["H1", "N2", "N1", "H1"]
    ring_length_m: number;
    ring: XY[]; // the whole closed cable route, hub to hub
    naive_ring?: XY[]; // older files only: the naive routing (now in `alternatives`)
}

export interface CableMetrics {
    H?: number;
    L?: number;
    X?: number;
    O?: number;
    B?: number;
    J?: number;
    area_gap_m2?: number;
}

export interface CableProblems {
    crossings: XY[];
    overlaps: XY[][]; // stretches where cable runs on top of cable
}

export interface CableCheck {
    name: string;
    passed: boolean;
    detail: string;
}

export interface CablePlan {
    plan_id: number;
    units: "m";
    units_per_metre?: number;
    wall_depth_m?: number;
    bounds: { min_x: number; min_y: number; max_x: number; max_y: number };
    // Where the editor's origin sits, in these metres: plan px = (x - x0, y0 - y) * PX_PER_METER.
    // Missing: the plan's top-left corner (dataset plans). Drawn plans use 0, 0
    // so the result lands exactly on the walls that were drawn.
    frame?: { x0: number; y0: number };
    outline?: CableShape[];
    walls: CableShape[];
    doors: CableShape[];
    front_doors: CableShape[];
    windows: CableShape[];
    rooms: CableRoom[];
    nodes: CableNode[];
    hubs: CableHub[];
    metrics: CableMetrics;

    // From a live solve (older exported files may not have these).
    status?: "solved" | "infeasible" | "excluded" | "failed" | "error";
    reason?: string | null;
    warning?: string | null;
    notice?: string | null; // e.g. why a dragged hub didn't stay where it was dropped
    checks?: CableCheck[];
    problems?: CableProblems;
    naive_metrics?: CableMetrics; // older files only
    naive_problems?: CableProblems; // older files only
    submission?: unknown; // the slide-8 file, as the organisers want it
    source?: { kind: "dataset" | "drawn" };
    // The same plan solved other ways, to compare with ours (solver/baselines.py).
    alternatives?: Partial<Record<Baseline, CableAlternative>>;
    // Set when a room over 100 m² was split for two hubs: outside the deck's rules.
    extended?: string[];
    // Why ours looks the way it does, from the solver's own numbers (solver/explain.py).
    explain?: CableExplain;
}

export interface CableExplain {
    summary: string[]; // why this many hubs, how the zoning was picked, the cost and its lower bound
    hubs: Record<string, string[]>; // per hub: its rooms, its spot, its order, its ring
    hub_count?: { H: number; by_area: number; by_nodes: number; alone: { room: string; why: string }[] };
    // No design with the same hubs costs less than J on the solver's grid.
    lower_bound?: { J: number; gap_pct: number; complete: boolean };
}

// Ours, and the ways we compare it with: our zones and orders with each leg
// routed alone, a greedy method, and Clarke–Wright savings.
export type Baseline = "naive" | "greedy" | "savings";
export type SolutionId = "ours" | Baseline;
export const SOLUTION_LABELS: Record<SolutionId, string> = {
    ours: "Ours",
    naive: "Naive routing",
    greedy: "Greedy",
    savings: "Clarke–Wright",
};

export interface CableAlternative {
    label: string;
    status: string;
    reason: string | null;
    metrics: CableMetrics;
    valid: boolean;
    hubs: CableHub[];
    problems?: CableProblems;
}

// One entry of public/cable-plans/index.json.
export interface CablePlanSummary {
    plan_id: number;
    hubs: number;
    rooms: number;
    J: number | null;
}

export type CableHeight = "floor" | "skirting" | "ceiling";
export type CableFloor = "zones" | "wood" | "tiles";

// How an imported plan is drawn (session state, not saved).
export interface CableLayers {
    rooms: boolean; // floors, walls, doors, windows
    labels: boolean; // room names and areas
    cables: boolean; // rings, hubs, nodes
    cutaway: boolean; // 3D: low walls so the cables show
    animate: boolean; // a pulse running round each ring, hub first
    problems: boolean; // crossings and overlaps in red
    solution: SolutionId; // which solution is drawn
    overlay: SolutionId | null; // another one's rings, dashed grey underneath
    height: CableHeight; // 3D: where the cable runs
    floor: CableFloor; // 3D: floor finish (zones = tinted by hub)
    dimensions: boolean; // each room's wall lengths
}

export const DEFAULT_LAYERS: CableLayers = {
    rooms: true,
    labels: true,
    cables: true,
    cutaway: true,
    animate: false,
    problems: true,
    solution: "ours",
    overlay: null,
    height: "floor",
    floor: "wood",
    dimensions: true,
};

const frameOf = (plan: CablePlan) => plan.frame ?? { x0: plan.bounds.min_x, y0: plan.bounds.max_y };

// Solver metres -> plan pixels (y down).
export const toPlan = (plan: CablePlan, [x, y]: XY): XY => {
    const { x0, y0 } = frameOf(plan);
    return [(x - x0) * PX_PER_METER, (y0 - y) * PX_PER_METER];
};

// Plan pixels -> solver metres (for a hub dragged on the 2D plan).
export const fromPlan = (plan: CablePlan, [px, py]: XY): XY => {
    const { x0, y0 } = frameOf(plan);
    return [x0 + px / PX_PER_METER, y0 - py / PX_PER_METER];
};

// Solver metres -> 3D floor position [x, z]: the same spot as on the 2D plan.
export const toScene = (plan: CablePlan, p: XY): XY => {
    const [px, py] = toPlan(plan, p);
    return [px / PX_PER_METER, py / PX_PER_METER];
};

// Identifies "the same plan, seen the same way": a re-solve of it (new
// object, same extent) shouldn't move the camera or the 2D view.
export const frameKey = (plan: CablePlan) => JSON.stringify([plan.plan_id, plan.bounds, plan.frame ?? null]);

// 3D floor position [x, z] -> solver metres (for a hub dragged in 3D).
export const fromScene = (plan: CablePlan, [x, z]: XY): XY => fromPlan(plan, [x * PX_PER_METER, z * PX_PER_METER]);

// SVG path for a shape; holes cut out with the even-odd rule.
export function shapePath(plan: CablePlan, shape: CableShape): string {
    return [shape.outer, ...shape.holes]
        .map((ring) => "M " + ring.map((p) => toPlan(plan, p).join(" ")).join(" L ") + " Z")
        .join(" ");
}

// Each hub gets its own colour (theme.css --color-hub-1 ... -6, then repeats).
const HUB_FALLBACKS = ["#d1495b", "#2e86ab", "#e8a33d", "#6a4c93", "#3b9b6b", "#c46d2b"];

export const hubIndex = (hubId: string | null) => {
    const n = hubId ? parseInt(hubId.replace(/\D/g, ""), 10) : NaN;
    return Number.isNaN(n) ? 0 : (n - 1) % HUB_FALLBACKS.length;
};

// For SVG, which accepts CSS variables.
export const hubVar = (hubId: string | null) => `var(--color-hub-${hubIndex(hubId) + 1})`;

// The variable's name and fallback, for themeColor() in three.js.
export const hubToken = (hubId: string | null): [string, string] => [
    `--color-hub-${hubIndex(hubId) + 1}`,
    HUB_FALLBACKS[hubIndex(hubId)],
];

// The hub serving each node, from the rings' sequences.
export function hubOfNode(plan: CablePlan): Record<string, string> {
    const out: Record<string, string> = {};
    for (const h of plan.hubs) for (const id of h.sequence) if (id !== h.hub_id) out[id] = h.hub_id;
    return out;
}

/** Solver nodes are the generated room devices; derive their assignments and
 * order from the selected solution instead of copying them into planFurniture. */
export function solverDeviceDetails(plan: CablePlan | null): SolverDeviceDetail[] {
    if (!plan) return [];
    const roomById = new Map(plan.rooms.filter((room) => room.room_id).map((room) => [room.room_id!, room]));
    const hubByNode: Record<string, string> = {};
    const orderByNode: Record<string, number> = {};
    for (const hub of plan.hubs) {
        hub.sequence.forEach((id, index) => {
            if (id !== hub.hub_id && id.startsWith("N")) {
                hubByNode[id] = hub.hub_id;
                orderByNode[id] = index;
            }
        });
    }
    return plan.nodes.map((node) => {
        const room = roomById.get(node.room_id);
        const index = orderByNode[node.node_id];
        return {
            ...node,
            roomKind: room?.kind ?? null,
            roomLabel: room?.label ?? null,
            hubId: hubByNode[node.node_id] ?? null,
            sequenceNumber: index == null ? null : index,
        };
    });
}

// Every way this plan was solved, ours excluded. Older files kept only the
// naive rings (per hub), which become a naive alternative here.
export function alternativesOf(plan: CablePlan): Partial<Record<Baseline, CableAlternative>> {
    if (plan.alternatives) return plan.alternatives;
    if (!plan.hubs.some((h) => h.naive_ring)) return {};
    return {
        naive: {
            label: SOLUTION_LABELS.naive,
            status: "solved",
            reason: null,
            metrics: plan.naive_metrics ?? {},
            valid: true,
            hubs: plan.hubs.map((h) => ({ ...h, ring: h.naive_ring ?? h.ring })),
            problems: plan.naive_problems,
        },
    };
}

/** Only affirmative solver validation can mark a route as valid. */
export function isSolutionValidated(plan: CablePlan, id: SolutionId): boolean {
    if (id === "ours") return plan.status === "solved" && !!plan.checks?.length && plan.checks.every((check) => check.passed);
    const alternative = alternativesOf(plan)[id];
    return alternative?.status === "solved" && alternative.valid;
}

// The plan as one solution draws it: its hubs, rings, metrics and problems,
// and each room tinted by the hub that serves it there. The 2D and 3D views
// draw whatever this returns, so every solution looks the same way.
export function solutionView(plan: CablePlan, id: SolutionId): CablePlan {
    const alt = id === "ours" ? null : alternativesOf(plan)[id];
    if (!alt) return plan;
    const hubOfRoom = new Map(alt.hubs.flatMap((h) => (h.assigned_rooms ?? []).map((r) => [r, h.hub_id] as const)));
    return {
        ...plan,
        hubs: alt.hubs,
        rooms: plan.rooms.map((r) => (r.room_id ? { ...r, hub_id: hubOfRoom.get(r.room_id) ?? null } : r)),
        metrics: alt.metrics,
        problems: alt.problems,
        status: alt.status === "solved" && alt.valid ? "solved" : "failed",
        reason: alt.status === "solved" && !alt.valid
            ? alt.reason ?? "The solver's validation checks rejected this comparison."
            : alt.reason,
        checks: undefined,
    };
}

// The rings to draw: the overlay's (faint) under the shown solution's.
export function ringsToDraw(view: CablePlan, overlay: CablePlan | null) {
    return [
        ...(overlay ? overlay.hubs.map((hub) => ({ hub, points: hub.ring, faint: true })) : []),
        ...view.hubs.map((hub) => ({ hub, points: hub.ring, faint: false })),
    ];
}

// A loaded file must at least have these, or nothing can be drawn.
export function isCablePlan(data: unknown): data is CablePlan {
    const d = data as Partial<CablePlan> | null;
    return (
        !!d &&
        typeof d.plan_id === "number" &&
        !!d.bounds &&
        Array.isArray(d.rooms) &&
        Array.isArray(d.walls) &&
        Array.isArray(d.hubs) &&
        Array.isArray(d.nodes)
    );
}

// Even-odd ray cast (the same test as 2d/planGeometry's insidePolygon, which
// can't be imported here without an import cycle through the store).
function inside([x, y]: XY, ring: XY[]): boolean {
    let hit = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
}

export interface RoomEdge {
    a: XY;
    b: XY;
    length: number; // metres
    inward: XY; // unit vector from the edge into the room
}

// A room's walls worth measuring: its outline's edges of at least `minLength`
// metres (dataset outlines have many little jogs), each with the direction
// that points into the room, so its label sits inside.
export function roomEdges(room: CableRoom, minLength = 1): RoomEdge[] {
    const ring = room.shape.outer;
    const out: RoomEdge[] = [];
    for (let i = 0; i < ring.length; i++) {
        const a = ring[i];
        const b = ring[(i + 1) % ring.length];
        const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (length < minLength) continue;
        const n: XY = [-(b[1] - a[1]) / length, (b[0] - a[0]) / length];
        const mid: XY = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        const probe: XY = [mid[0] + n[0] * 0.2, mid[1] + n[1] * 0.2];
        out.push({ a, b, length, inward: inside(probe, ring) ? n : [-n[0], -n[1]] });
    }
    return out;
}

/**
 * Return only dimension lines whose complete, inset segment remains inside the
 * room polygon. Some ResPlan room outlines are concave or contain holes; a
 * locally inward-facing edge normal alone can put an annotation in empty
 * space after the edge turns or narrows.
 */
export function roomDimensionEdges(
    room: CableRoom,
    minLength = 1,
    inset = 10 / PX_PER_METER,
    trim = 6 / PX_PER_METER,
): RoomEdge[] {
    const contains = (p: XY) => inside(p, room.shape.outer) && !room.shape.holes.some((hole) => inside(p, hole));
    return roomEdges(room, minLength).filter((edge) => {
        if (edge.length <= trim * 2) return false;
        const count = Math.max(4, Math.ceil(edge.length / 0.2));
        for (let i = 0; i <= count; i++) {
            const t = trim + (edge.length - trim * 2) * i / count;
            const p: XY = [
                edge.a[0] + (edge.b[0] - edge.a[0]) * t / edge.length + edge.inward[0] * inset,
                edge.a[1] + (edge.b[1] - edge.a[1]) * t / edge.length + edge.inward[1] * inset,
            ];
            if (!contains(p)) return false;
        }
        return true;
    });
}
