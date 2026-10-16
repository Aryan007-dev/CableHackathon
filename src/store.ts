import { create } from "zustand";
import { produceWithPatches, applyPatches, enablePatches } from "immer";
import type { Patch } from "immer";

import { supabase } from "./supabase";
import { PX_PER_METER } from "./units";
import type { LengthUnit } from "./units";
import { DEFAULT_LAYERS } from "./cable/cablePlan";
import type { CableLayers, CablePlan } from "./cable/cablePlan";
// This closes an import cycle: store -> planToScene -> planGeometry -> store,
// which needs OPENING_DEFAULTS from here. It is safe because nothing in that
// chain reads an imported value while the modules are still evaluating
// (OPENING_DEFAULTS is only read inside a function body), so every binding is
// initialised before anything first uses it.
import { planToScene } from "./2d/planToScene";

// Unit preference is remembered per browser. Storage can throw (private
// mode, blocked site data), so fall back to metres.
const loadUnits = (): LengthUnit => {
    try {
        return localStorage.getItem("units") === "ft" ? "ft" : "m";
    } catch {
        return "m";
    }
};


enablePatches();

type Entry = {
    patches: Patch[];
    inverse: Patch[];
};

type Vec3 = [number, number, number];
type Quat = [number, number, number, number];

type Rectangle = { x1: number; y1: number; x2: number; y2: number };

// One straight wall on the 2D plan, in plan pixels. The Rectangle tool adds
// four of these sharing a roomId, so each wall can be moved or deleted alone.
export interface PlanWall {
    // Stable identity: indexes shift when walls are deleted, so doors and
    // windows point at their wall by id.
    id: string;
    a: [number, number];
    b: [number, number];
    roomId?: string;
}

const rectangleWalls = (r: Rectangle, roomId: string): PlanWall[] => {
    const corners: [number, number][] = [[r.x1, r.y1], [r.x2, r.y1], [r.x2, r.y2], [r.x1, r.y2]];
    return corners.map((a, i) => ({ id: crypto.randomUUID(), a, b: corners[(i + 1) % 4], roomId }));
};

// A door or window. It isn't a free object: it lives ON a wall, described by
// which wall and how far along it. Sizes are real-world metres (the 3D view
// needs them); the 2D plan converts with PX_PER_METER.
export interface Opening {
    id: string;
    kind: "door" | "window";
    wallId: string;
    offset: number; // metres from the wall's `a` end to the opening's centre
    width: number;
    height: number;
    sill: number; // height of the bottom above the floor (0 for doors)
    flip?: boolean; // doors: swing to the other side of the wall
}

// What a 3D wall needs to know about an opening (it's already attached to the wall).
export type WallOpening = Omit<Opening, "id" | "wallId">;

export const OPENING_DEFAULTS: Record<Opening["kind"], Pick<Opening, "width" | "height" | "sill">> = {
    door: { width: 0.9, height: 2.1, sill: 0 },
    window: { width: 1.2, height: 1.2, sill: 0.9 },
};

// Keep every opening on a wall that still exists and fully inside it. An
// opening whose wall was deleted, or became too short for it, is dropped.
export function fitOpenings(openings: Opening[], walls: PlanWall[]): Opening[] {
    const lengths = new Map(walls.map((w) => [w.id, Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]) / PX_PER_METER]));
    return openings.flatMap((o) => {
        const length = lengths.get(o.wallId);
        if (length === undefined || length < o.width) return [];
        const offset = Math.min(Math.max(o.offset, o.width / 2), length - o.width / 2);
        return [offset === o.offset ? o : { ...o, offset }];
    });
}

// A 2D furniture symbol placed on the plan. It records WHAT it is (a symbol from
// src/2d/symbolLibrary.ts) plus where it is, how it's turned and how big, which
// is exactly what an AI furnish step needs to swap in a real 3D catalog model.
export interface PlanFurniture {
    id: string;
    symbolId: string;
    x: number; // centre, plan pixels
    y: number;
    rotation: number; // degrees clockwise; 0 = front faces +y (south)
    width: number; // metres
    depth: number;
}

// Two floor points count as the "same corner" if their x and z are within 1cm.
const samePoint = (a: Vec3, b: Vec3) =>
    Math.abs(a[0] - b[0]) < 0.01 && Math.abs(a[2] - b[2]) < 0.01;

interface Transform {
    position: Vec3;
    rotation: Quat;
    scale: Vec3;
}

interface BaseNode {
    id: string;
    name: string;
    parentId: string | null;
    transform: Transform;
}

interface FloorNode extends BaseNode {
    type: "Floor";
    assetId: "laminate" | "concrete";
    length: number;
    width: number;
}

interface FurnitureNode extends BaseNode {
    type: "furniture";
    assetId: string;
    materialOverrides?: Record<string, string>;

    // Real footprint [width (x), depth (z)] in meters, measured from the
    // GLB's bounding box at load time. Used by findFreeSpace for accurate
    // overlap tests.
    footprint?: [number, number];

    // True for furniture generated from a 2D plan symbol, so a rebuild can
    // replace it without touching pieces placed by hand in 3D.
    fromPlan?: boolean;
}
interface PlaceHolderNode extends BaseNode {
    type: "placeholder";
    width: number;
    depth: number;
    height: number;

    // As on FurnitureNode: this box came from a 2D plan symbol.
    fromPlan?: boolean;
}


interface WallNode extends BaseNode {
    type: "wall";
    materialId: string;
    start: Vec3;
    end: Vec3;
    height: number;
    thickness: number;

    // True for walls generated from the 2D plan by buildRoomFromPlan, so a
    // rebuild can replace them without touching hand-placed walls.
    fromPlan?: boolean;

    // Doors and windows copied from the plan; the wall is built around their holes.
    openings?: WallOpening[];
}

interface LightNode extends BaseNode {
    type: "light";
    lightType: "point" | "spot" | "area";
    intensity: number;
    color: string;
    temperature?: number;
}

export type SceneNode = FurnitureNode | WallNode | LightNode | FloorNode|PlaceHolderNode;

interface SceneDocument {
    id: string;

    // Existing freehand floor-plan points.
    floorPlan: [number, number][];

    // Independent walls (rectangle rooms are stored as four of these).
    planWalls: PlanWall[];

    // Doors and windows, each sitting on one of planWalls.
    openings: Opening[];

    // 2D furniture symbols placed on the plan.
    planFurniture: PlanFurniture[];

    version: number;

    room: { width: number; length: number; height: number };

    nodes: Record<string, SceneNode>;

    // Snapshot of floorPlan + planWalls the current 3D plan walls were built from.
    builtPlanKey?: string;

    // A solved Cable Ring plan shown under the 2D plan and in 3D (read-only).
    cablePlan: CablePlan | null;
}

// Saves made before a field existed won't have it; fill the gaps so the UI
// can rely on every field being present.
export function normalizeDoc(raw: SceneDocument & { rectangles?: Rectangle[] }): SceneDocument {
    const { rectangles, ...rest } = raw;
    // Older saves stored whole rectangles (split each into four walls), and
    // walls without ids (give them one so openings can refer to them).
    const planWalls = (raw.planWalls ?? (rectangles ?? []).flatMap((r) => rectangleWalls(r, crypto.randomUUID())))
        .map((w) => (w.id ? w : { ...w, id: crypto.randomUUID() }));
    return {
        ...rest,
        nodes: raw.nodes ?? {},
        floorPlan: raw.floorPlan ?? [],
        planWalls,
        openings: fitOpenings(raw.openings ?? [], planWalls),
        planFurniture: raw.planFurniture ?? [],
        cablePlan: raw.cablePlan ?? null,
    };
}

// Any subset of the 2D plan, replaced together in one undoable commit.
type PlanChanges = Partial<Pick<SceneDocument, "floorPlan" | "planWalls" | "openings" | "planFurniture">>;

interface EditorState {
    doc: SceneDocument;

    selectedIds: string[];
    dismissedTips: string[];

    undoStack: Entry[];
    redoStack: Entry[];

    addNode: (n: SceneNode) => void;
    dismissTip: (id: string) => void;
    updateTransform: (id: string, t: Partial<Transform>) => void;
    updateNode: (id: string, t: Partial<SceneNode>) => void;
    moveCorner: (from: Vec3, to: Vec3) => void;
    removeNode: (id: string) => void;
    select: (ids: string[]) => void;

    undo: () => void;
    redo: () => void;

    setFloorPlan: (p: [number, number][]) => void;
    addRectangle: (rectangle: Rectangle) => void;
    setPlan: (changes: PlanChanges) => void;
    addOpening: (opening: Opening) => void;
    addPlanFurniture: (item: PlanFurniture) => void;
    buildRoomFromPlan: () => void;

    // Show a solved cable plan (one undo step), or remove it.
    importCablePlan: (plan: CablePlan) => void;
    clearCablePlan: () => void;

    // Session state: which parts of the cable plan are drawn (not saved, not undone).
    cableLayers: CableLayers;
    setCableLayer: <K extends keyof CableLayers>(layer: K, value: CableLayers[K]) => void;
    // The hub being inspected (others are dimmed), or null for all.
    cableFocus: string | null;
    setCableFocus: (hubId: string | null) => void;
    // A solve in progress ("Routing plan 2814…"), or the last solve's error.
    cableBusy: string | null;
    cableError: string | null;
    setCableStatus: (busy: string | null, error?: string | null) => void;
    // Bumped to ask the 3D view for a PNG of what it shows.
    screenshotRequest: number;
    requestScreenshot: () => void;

    mode: "translate" | "rotate" | "scale";
    setMode: (m: "translate" | "rotate" | "scale") => void;

    cameraMode: "perspective" | "topdown";
    setCameraMode: (m: "perspective" | "topdown") => void;

    // Session state: display unit for dimension labels (not saved, not undone).
    units: LengthUnit;
    setUnits: (u: LengthUnit) => void;

    currentProjectId: string | null;
    currentProjectName: string | null;

    saveProject: (name: string) => Promise<void>;
    loadProject: (projectId: string) => Promise<void>;
    setProjectName: (name: string) => void;
    listProjects: () => Promise<ProjectSummary[]>;
    deleteProject: (projectId: string) => Promise<void>;
    newProject: () => void;
}

const emptyDoc = (): SceneDocument => ({
    id: crypto.randomUUID(),
    version: 1,
    room: { width: 5, length: 4, height: 2.7 },
    nodes: {},
    floorPlan: [],
    planWalls: [],
    openings: [],
    planFurniture: [],
    cablePlan: null,
});

export interface ProjectSummary {
    id: string;
    name: string;
    updated_at: string;
}

export const useEditor = create<EditorState>((set, get) => {
    const commit = (recipe: (d: SceneDocument) => void) => {
        const before = Object.keys(get().doc.nodes).length;
        const [next, patches, inverse] = produceWithPatches(get().doc, recipe);
        const after = Object.keys(next.nodes).length;

        console.log("[store.commit] nodes", before, "->", after, "| patches:", patches.length);

        set((s) => ({
            doc: next,
            undoStack: [...s.undoStack, { patches, inverse }],
            redoStack: [],
        }));
    };

    return {
        doc: emptyDoc(),

        dismissedTips: [],
        selectedIds: [],
        undoStack: [],
        redoStack: [],

        mode: "translate",
        cameraMode: "perspective",

        currentProjectId: null,
        currentProjectName: null,

        setCameraMode: (m) => set({ cameraMode: m }),

        cableLayers: DEFAULT_LAYERS,
        setCableLayer: (layer, value) => set((s) => ({ cableLayers: { ...s.cableLayers, [layer]: value } })),
        cableFocus: null,
        setCableFocus: (hubId) => set({ cableFocus: hubId }),
        cableBusy: null,
        cableError: null,
        setCableStatus: (busy, error = null) => set({ cableBusy: busy, cableError: error }),
        screenshotRequest: 0,
        requestScreenshot: () => set((s) => ({ screenshotRequest: s.screenshotRequest + 1 })),

        importCablePlan: (plan) => {
            commit((d) => {
                d.cablePlan = plan;
            });
            set({ cableFocus: null });
        },

        clearCablePlan: () => {
            commit((d) => {
                d.cablePlan = null;
            });
            set({ cableFocus: null });
        },

        units: loadUnits(),
        setUnits: (u) => {
            try {
                localStorage.setItem("units", u);
            } catch {
                // preference just won't persist
            }
            set({ units: u });
        },

        saveProject: async (name: string) => {
            const { doc, currentProjectId } = get();
            const { data: { user } } = await supabase.auth.getUser();

            if (!user) {
                throw new Error("You must be logged in to save projects");
            }

            if (currentProjectId) {
                const { error } = await supabase
                    .from("projects")
                    .update({ name, data: doc, updated_at: new Date().toISOString() })
                    .eq("id", currentProjectId)
                    .eq("user_id", user.id);

                if (error) throw error;

                set({ currentProjectName: name });
            } else {
                const { data, error } = await supabase
                    .from("projects")
                    .insert({ user_id: user.id, name, data: doc })
                    .select()
                    .single();

                if (error) throw error;

                set({ currentProjectId: data.id, currentProjectName: name });
            }
        },

        loadProject: async (projectId: string) => {
            const { data, error } = await supabase
                .from("projects")
                .select()
                .eq("id", projectId)
                .single();

            if (error) throw error;

            const loadedDoc = normalizeDoc(data.data);

            set({
                doc: loadedDoc,
                currentProjectId: data.id,
                currentProjectName: data.name,
                undoStack: [],
                redoStack: [],
                selectedIds: [],
            });
        },

        setProjectName: (name: string) => set({ currentProjectName: name }),

        // Names and dates only: the heavy `data` column stays on the server
        // until a project is actually opened.
        listProjects: async () => {
            const { data, error } = await supabase
                .from("projects")
                .select("id, name, updated_at")
                .order("updated_at", { ascending: false });
            if (error) throw error;
            return data ?? [];
        },

        deleteProject: async (projectId: string) => {
            const { error } = await supabase.from("projects").delete().eq("id", projectId);
            if (error) throw error;
            if (get().currentProjectId === projectId) {
                set({ currentProjectId: null, currentProjectName: null });
            }
        },

        // Start from a blank document, detached from any saved project.
        newProject: () =>
            set({
                doc: emptyDoc(),
                currentProjectId: null,
                currentProjectName: null,
                undoStack: [],
                redoStack: [],
                selectedIds: [],
                cableFocus: null,
            }),

        setMode: (m) => set({ mode: m }),

        dismissTip: (id: string) =>
            set((s) => ({ dismissedTips: [...s.dismissedTips, id] })),

        addNode: (n) => {
            console.log("[store.addNode]", n.type, n.id);
            commit((d) => {
                d.nodes[n.id] = n;
            });
        },

        setFloorPlan: (p: [number, number][]) =>
            commit((d) => {
                d.floorPlan = p;
            }),

        // A rectangle room is stored as four separate walls sharing a roomId.
        addRectangle: (rectangle: Rectangle) =>
            commit((d) => {
                d.planWalls.push(...rectangleWalls(rectangle, crypto.randomUUID()));
            }),

        // Replace any parts of the 2D plan together in ONE commit, so a
        // multi-item edit (walls + doors + furniture) is a single undo step.
        // Moving or deleting walls can strand openings, so they're refit here too.
        setPlan: (changes: PlanChanges) => {
            const { doc } = get();
            const nextOpenings = fitOpenings(changes.openings ?? doc.openings, changes.planWalls ?? doc.planWalls);
            commit((d) => {
                if (changes.floorPlan) d.floorPlan = changes.floorPlan;
                if (changes.planWalls) d.planWalls = changes.planWalls;
                if (changes.planFurniture) d.planFurniture = changes.planFurniture;
                d.openings = nextOpenings;
            });
        },

        addOpening: (opening: Opening) =>
            commit((d) => {
                d.openings.push(opening);
            }),

        addPlanFurniture: (item: PlanFurniture) =>
            commit((d) => {
                d.planFurniture.push(item);
            }),


        buildRoomFromPlan: () => {
            const scale = PX_PER_METER;
            const { floorPlan, planWalls, openings, planFurniture, nodes, builtPlanKey } = get().doc;

            const planKey = JSON.stringify({ floorPlan, planWalls, openings, planFurniture });
            const hasPlanNodes = Object.values(nodes).some(
                (n) =>
                    (n.type === "wall" || n.type === "furniture" || n.type === "placeholder") &&
                    n.fromPlan
            );

            // Plan unchanged since the last build: keep the existing nodes so
            // corner edits made in 3D survive a 2D -> 3D round trip.
            if (planKey === builtPlanKey && hasPlanNodes) {
                return;
            }

            // Need at least 3 freehand points, one plan wall or one piece of 2D
            // furniture (unless old plan nodes are left over and must be cleared).
            if (
                floorPlan.length < 3 &&
                planWalls.length === 0 &&
                planFurniture.length === 0 &&
                !hasPlanNodes
            ) {
                return;
            }

            const makeWall = (start: Vec3, end: Vec3): WallNode => ({
                id: crypto.randomUUID(),
                name: "Wall",
                parentId: null,
                transform: {
                    position: [0, 0, 0],
                    rotation: [0, 0, 0, 1],
                    scale: [1, 1, 1],
                },
                type: "wall",
                start,
                end,
                height: 2.7,
                thickness: 0.1,
                materialId: "wall",
                fromPlan: true,
            });

            commit((d) => {
                // 0. Replace, don't append: drop everything the previous build
                //    made. Hand-placed nodes carry no fromPlan flag and survive.
                for (const id in d.nodes) {
                    const n = d.nodes[id];
                    const built =
                        (n.type === "wall" || n.type === "furniture" || n.type === "placeholder") &&
                        n.fromPlan;
                    if (built) delete d.nodes[id];
                }
                d.builtPlanKey = planKey;

                // 1. Build walls from freehand floor plan.
                if (floorPlan.length >= 3) {
                    for (let i = 0; i < floorPlan.length; i++) {
                        const a = floorPlan[i];
                        const b = floorPlan[(i + 1) % floorPlan.length];

                        const wall = makeWall(
                            [a[0] / scale, 0, a[1] / scale],
                            [b[0] / scale, 0, b[1] / scale]
                        );

                        d.nodes[wall.id] = wall;
                    }
                }

                // 2. Build one 3D wall per independent plan wall, carrying its
                //    doors and windows. Its start is the plan wall's `a`, so
                //    each opening's offset still measures from the start.
                for (const w of planWalls) {
                    const wall = makeWall(
                        [w.a[0] / scale, 0, w.a[1] / scale],
                        [w.b[0] / scale, 0, w.b[1] / scale]
                    );
                    const wallOpenings = openings.filter((o) => o.wallId === w.id);
                    if (wallOpenings.length > 0) {
                        wall.openings = wallOpenings.map(({ kind, offset, width, height, sill, flip }) => ({
                            kind, offset, width, height, sill, flip,
                        }));
                    }
                    d.nodes[wall.id] = wall;
                }

                // 3. One node per 2D furniture symbol: a real catalog model when
                //    one matches it, otherwise a labelled placeholder box. The
                //    node reuses the 2D piece's id, so they stay matched.
                for (const piece of planFurniture) {
                    d.nodes[piece.id] = planToScene(piece);
                }
            });
        },

        updateTransform: (id, t) =>
            commit((d) => {
                Object.assign(d.nodes[id].transform, t);
            }),

        removeNode: (id) =>
            commit((d) => {
                delete d.nodes[id];
            }),

        updateNode: (id, partial) =>
            commit((d) => {
                Object.assign(d.nodes[id], partial);
            }),

        moveCorner: (from, to) =>
            commit((d) => {
                for (const id in d.nodes) {
                    const n = d.nodes[id];
                    if (n.type !== "wall") continue;

                    if (samePoint(n.start, from)) n.start = to;
                    if (samePoint(n.end, from)) n.end = to;
                }
            }),

        select: (ids) => set({ selectedIds: ids }),

        redo: () =>
            set((s) => {
                const next = s.redoStack.at(-1);
                if (!next) return s;

                return {
                    doc: applyPatches(s.doc, next.patches),
                    undoStack: [...s.undoStack, next],
                    redoStack: s.redoStack.slice(0, -1),
                };
            }),

        undo: () =>
            set((s) => {
                const last = s.undoStack.at(-1);
                if (!last) return s;

                return {
                    doc: applyPatches(s.doc, last.inverse),
                    undoStack: s.undoStack.slice(0, -1),
                    redoStack: [...s.redoStack, last],
                };
            }),
    };
});