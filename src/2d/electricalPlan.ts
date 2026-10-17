import type { LengthUnit } from "../units.ts";
import { PX_PER_METER } from "../units.ts";
import { SYMBOL_BY_ID } from "./symbolLibrary.ts";

export type ElectricalScheduleRow = { label: string; count: number };
export type ElectricalSchedule = { total: number; byType: ElectricalScheduleRow[] };
export type PlanBounds = { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number };
export type ElectricalPlanFurniture = { id: string; symbolId: string; x: number; y: number; rotation: number; width: number; depth: number };
export type ElectricalDatasetDetails = {
    solutionId: "ours" | "naive" | "greedy" | "savings";
    electricalSchedule: ElectricalSchedule;
    solverDevices: { node_id: string; room_id: string; roomKind: string | null; hubId: string | null; sequenceNumber: number | null; x: number; y: number }[];
};

export function createElectricalPlacement(
    symbolId: string,
    id: string,
    x: number,
    y: number,
    rotation = 0
): ElectricalPlanFurniture | null {
    const symbol = SYMBOL_BY_ID[symbolId];
    if (!symbol || symbol.category !== "Electrical") return null;
    return { id, symbolId, x, y, rotation, width: symbol.width, depth: symbol.depth };
}

export function getElectricalSchedule(items: ElectricalPlanFurniture[]): ElectricalSchedule {
    const counts = new Map<string, number>();
    for (const item of items) {
        const symbol = SYMBOL_BY_ID[item.symbolId];
        if (symbol?.category === "Electrical") counts.set(symbol.label, (counts.get(symbol.label) ?? 0) + 1);
    }
    const byType = [...counts].map(([label, count]) => ({ label, count })).sort((a, b) => a.label.localeCompare(b.label));
    return { total: byType.reduce((sum, row) => sum + row.count, 0), byType };
}

export function combineElectricalSchedules(...schedules: ElectricalSchedule[]): ElectricalSchedule {
    const counts = new Map<string, number>();
    for (const schedule of schedules) for (const row of schedule.byType) {
        counts.set(row.label, (counts.get(row.label) ?? 0) + row.count);
    }
    const byType = [...counts].map(([label, count]) => ({ label, count })).sort((a, b) => a.label.localeCompare(b.label));
    return { total: byType.reduce((sum, row) => sum + row.count, 0), byType };
}

export function normalizePlanFurniture(items: ElectricalPlanFurniture[] | null | undefined): ElectricalPlanFurniture[] {
    return Array.isArray(items) ? items : [];
}

export function addPlanFurnitureItem(items: ElectricalPlanFurniture[], item: ElectricalPlanFurniture): ElectricalPlanFurniture[] {
    return [...items, item];
}

export function removePlanFurnitureItems(items: ElectricalPlanFurniture[], ids: Set<string>): ElectricalPlanFurniture[] {
    return items.filter((item) => !ids.has(item.id));
}

export function screenToPlanPoint(screen: [number, number], pan: [number, number], scale: number): [number, number] {
    return [(screen[0] - pan[0]) / scale, (screen[1] - pan[1]) / scale];
}

export function scaleBarMeters(exportPixels: number, exportPixelsPerPlanPixel: number): number {
    return exportPixels / (PX_PER_METER * exportPixelsPerPlanPixel);
}

export function exportOrientation(width: number, height: number): "portrait" | "landscape" {
    return height > width ? "portrait" : "landscape";
}

type PlanGeometry = {
    floorPlan?: [number, number][];
    planWalls?: { id: string; a: [number, number]; b: [number, number] }[];
    openings?: { wallId: string; offset: number; width: number }[];
    planFurniture?: ElectricalPlanFurniture[];
};

/** Bounds of actual plan geometry in plan pixels, independent of the screen grid or zoom. */
export function getPlanBounds(plan: PlanGeometry): PlanBounds | null {
    const xs: number[] = [];
    const ys: number[] = [];
    const add = (x: number, y: number) => { xs.push(x); ys.push(y); };
    plan.floorPlan?.forEach(([x, y]) => add(x, y));
    plan.planWalls?.forEach((wall) => { add(...wall.a); add(...wall.b); });

    const walls = plan.planWalls ?? [];
    plan.openings?.forEach((opening) => {
        const wall = walls.find((item) => item.id === opening.wallId);
        if (!wall) return;
        const dx = wall.b[0] - wall.a[0];
        const dy = wall.b[1] - wall.a[1];
        const length = Math.hypot(dx, dy);
        if (!length) return;
        const ux = dx / length;
        const uy = dy / length;
        const cx = wall.a[0] + ux * opening.offset * PX_PER_METER;
        const cy = wall.a[1] + uy * opening.offset * PX_PER_METER;
        const half = opening.width * PX_PER_METER / 2;
        add(cx - ux * half, cy - uy * half);
        add(cx + ux * half, cy + uy * half);
    });

    plan.planFurniture?.forEach((item) => {
        const halfW = item.width * PX_PER_METER / 2;
        const halfD = item.depth * PX_PER_METER / 2;
        const angle = (item.rotation * Math.PI) / 180;
        for (const [x, y] of [[-halfW, -halfD], [halfW, -halfD], [halfW, halfD], [-halfW, halfD]] as const) {
            add(item.x + x * Math.cos(angle) - y * Math.sin(angle), item.y + x * Math.sin(angle) + y * Math.cos(angle));
        }
    });

    if (xs.length === 0) return null;
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

export function createPlanDataset<T extends { planFurniture?: ElectricalPlanFurniture[] }>(
    plan: T & { planFurniture?: ElectricalPlanFurniture[] },
    title: string,
    imageDataUrl: string,
    exportedAt = new Date().toISOString(),
    units: LengthUnit = "m",
    electricalDetails?: ElectricalDatasetDetails
) {
    const schedule = electricalDetails?.electricalSchedule ?? getElectricalSchedule(normalizePlanFurniture(plan.planFurniture));
    return {
        format: "gridmind.floor-plan.dataset",
        schemaVersion: 1,
        exportedAt,
        metadata: {
            title,
            units,
            electricalSchedule: schedule,
            ...(electricalDetails ? { solutionId: electricalDetails.solutionId, solverDevices: electricalDetails.solverDevices } : {}),
        },
        plan,
        render: { mimeType: "image/png", dataUrl: imageDataUrl },
    };
}
