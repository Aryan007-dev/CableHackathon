// What the cable buttons do: ask the solver for a plan and put the answer in
// the document (one undo step each), showing progress and errors meanwhile.
import { useEditor } from "../store";
import { drawnPlanToSolverJson, solveCable } from "./cableApi";
import type { SolveRequest } from "./cableApi";

async function run(request: SolveRequest, busy: string): Promise<boolean> {
    const { setCableStatus, importCablePlan } = useEditor.getState();
    setCableStatus(busy);
    try {
        const plan = await solveCable(request);
        importCablePlan(plan);
        setCableStatus(null, plan.status !== "solved" ? `Not solved: ${plan.reason ?? plan.status}` : null);
        return true;
    } catch (e) {
        setCableStatus(null, (e as Error).message);
        return false;
    }
}

// A plan picked in the ResPlan import (the dev server kept the upload).
export const routeDatasetPlan = (datasetId: string, index: number, label: string) =>
    run({ datasetId, index }, `Routing ${label}… (reading the dataset takes a few seconds)`);

// The rooms drawn in the 2D editor.
export function routeDrawnPlan() {
    const { doc, setCableStatus } = useEditor.getState();
    const built = drawnPlanToSolverJson(doc.floorPlan, doc.planWalls, doc.openings);
    if ("error" in built) {
        setCableStatus(null, built.error);
        return Promise.resolve(false);
    }
    return run(built, "Routing the drawn plan…");
}

// A hub dragged to (x, y) metres: the solver keeps every zone and the other
// hubs, snaps this one to the nearest allowed spot and re-routes.
export function moveHub(hubId: string, x: number, y: number) {
    const plan = useEditor.getState().doc.cablePlan;
    if (!plan) return Promise.resolve(false);
    return run({ plan, move: { hub_id: hubId, x, y } }, `Re-routing around ${hubId}…`);
}
