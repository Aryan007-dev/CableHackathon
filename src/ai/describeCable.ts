// The loaded Cable Ring plan written out for the assistant: the rules, what
// the solver chose and WHY (its own explanations, solver/explain.py), and how
// ours compares with the baselines. The assistant answers "why" questions
// from this text, so it never has to guess, plus three tools to point at
// things on screen and to try moving a hub.
import { useEditor } from "../store";
import { moveHub } from "../cable/cableActions";
import { alternativesOf, SOLUTION_LABELS } from "../cable/cablePlan";
import type { CableMetrics, CablePlan, SolutionId } from "../cable/cablePlan";

const metricsText = (m: CableMetrics) =>
    m.H == null ? "no valid design" : `H ${m.H}, J ${m.J?.toFixed(2)} (L ${m.L?.toFixed(2)} m, X ${m.X}, O ${m.O?.toFixed(2)} m, B ${m.B})`;

const RULES = `Rules (UR Hackathon "Cable Ring"):
- Every living room, bedroom, kitchen and storage room has one node. Bathrooms, stairs, balconies and halls have none.
- Each node belongs to exactly one hub. A hub serves at most 100 m² of rooms and at most 5 nodes, and its rooms must connect to each other through their own doors or openings.
- Each hub's cable is a closed ring: hub -> its nodes in some order -> back to the hub, axis-aligned, inside the building, never through walls or windows.
- A hub stands inside one of its rooms, at least 0.5 m from every wall.
- Ranking: fewest hubs first, then lowest J = L + 5X + O + 0.5B (L metres of cable, X crossings, O metres of cable on top of cable, B bends); ties go to the smaller gap between the hubs' areas.
- Node positions: the organisers don't supply them, so the solver places each node at the point deepest inside its room.`;

export function describeCable(): string | null {
    const plan = useEditor.getState().doc.cablePlan;
    if (!plan) return null;
    const lines: string[] = [RULES, ""];
    const name = plan.source?.kind === "drawn" ? "the plan drawn in the editor" : `ResPlan plan ${plan.plan_id}`;
    lines.push(`Loaded: ${name}. Status: ${plan.status ?? "solved"}${plan.reason ? ` (${plan.reason})` : ""}.`);
    if (plan.warning) lines.push(`Warning: ${plan.warning}`);
    if (plan.notice) lines.push(`Last hub move: ${plan.notice}`);
    if (plan.extended?.length) lines.push(`Extended rules (outside the deck): ${plan.extended.join("; ")}.`);

    lines.push("", "Rooms (label, area, node, hub):");
    for (const r of plan.rooms) {
        const node = plan.nodes.find((n) => n.room_id === r.room_id);
        lines.push(`- ${r.label}: ${r.area_m2.toFixed(1)} m²` +
            (r.room_id ? `, node ${node?.node_id ?? "?"} at (${node?.x.toFixed(2)}, ${node?.y.toFixed(2)}), hub ${r.hub_id ?? "none"}` : ", no node"));
    }

    if (plan.hubs.length) {
        lines.push("", `Our design: ${metricsText(plan.metrics)}.`);
        for (const h of plan.hubs) {
            lines.push(`- ${h.hub_id} at (${h.x.toFixed(2)}, ${h.y.toFixed(2)}) m: ring ${h.sequence.join(" -> ")}, ${h.ring_length_m.toFixed(2)} m`);
        }
    }
    if (plan.explain) {
        lines.push("", "Why (the solver's own reasons; quote these numbers):");
        for (const s of plan.explain.summary) lines.push(`- ${s}`);
        for (const [hub, reasons] of Object.entries(plan.explain.hubs)) {
            lines.push(`${hub}:`);
            for (const s of reasons) lines.push(`  - ${s}`);
        }
    }
    const alts = Object.entries(alternativesOf(plan));
    if (alts.length) {
        lines.push("", "The same plan solved other ways (same nodes, same checker):");
        lines.push("- naive routing = our zones and orders, but each leg routed on its own; greedy = biggest room first, add the nearest neighbour while it fits, hub at the most open spot, nearest-neighbour order; Clarke–Wright = the classic savings method for vehicle routing, merging rings while they fit.");
        for (const [id, a] of alts) {
            if (!a) continue;
            lines.push(`- ${SOLUTION_LABELS[id as SolutionId] ?? a.label}: ${a.valid ? metricsText(a.metrics) : `failed: ${a.reason ?? a.status}`}`);
        }
    }
    const failed = plan.checks?.filter((c) => !c.passed) ?? [];
    if (plan.checks) {
        lines.push("", failed.length ? `Broken rules: ${failed.map((c) => `${c.name} (${c.detail})`).join("; ")}` : `All ${plan.checks.length} rule checks pass.`);
    }
    const layers = useEditor.getState().cableLayers;
    lines.push("", `On screen: ${SOLUTION_LABELS[layers.solution]}${layers.overlay ? ` with ${SOLUTION_LABELS[layers.overlay]} overlaid` : ""}.`);
    return lines.join("\n");
}

export const CABLE_PROMPT = `
==================================================
CABLE RING PLAN
==================================================

A Cable Ring plan is loaded. When the user asks about cables, hubs, rings,
nodes, zones, J, the rules, or why the design looks the way it does:
- Answer ONLY from the facts below. Quote the solver's reasons and numbers;
  never invent a reason, a distance or a cost.
- If the facts don't cover the question, say so plainly.
- Keep answers short: two to five sentences, or a short list.
- Use focusCableHub to point at the hub you are talking about, and
  showCableSolution to show a baseline next to ours when comparing.
- For "what if the hub were somewhere else", call moveCableHub, then report
  the new numbers against the old ones. Tell the user Undo brings the old
  design back.
`;

type CableTool = {
    name: string;
    description: string;
    input_schema: { type: "object"; properties: Record<string, { type: string; description?: string; enum?: string[] }>; required: string[] };
    handler: (args: Record<string, unknown>) => string | Promise<string>;
};

const hubIds = () => useEditor.getState().doc.cablePlan?.hubs.map((h) => h.hub_id) ?? [];

export const CABLE_TOOLS: CableTool[] = [
    {
        name: "focusCableHub",
        description: "Highlight one hub's ring on the cable plan (and show its reasons in the Cable panel), or clear the highlight with hubId \"\".",
        input_schema: { type: "object", properties: { hubId: { type: "string", description: "e.g. \"H1\", or \"\" for all" } }, required: ["hubId"] },
        handler: ({ hubId }) => {
            const id = String(hubId ?? "");
            if (id && !hubIds().includes(id)) return `No hub ${id}. Hubs: ${hubIds().join(", ")}`;
            useEditor.getState().setCableFocus(id || null);
            return id ? `Highlighted ${id}.` : "Showing every ring.";
        },
    },
    {
        name: "showCableSolution",
        description: "Choose which design the cable plan draws: ours or a baseline, optionally with another one overlaid in grey.",
        input_schema: {
            type: "object",
            properties: {
                solution: { type: "string", enum: ["ours", "naive", "greedy", "savings"] },
                overlay: { type: "string", enum: ["", "ours", "naive", "greedy", "savings"], description: "\"\" for none" },
            },
            required: ["solution"],
        },
        handler: ({ solution, overlay }) => {
            const plan = useEditor.getState().doc.cablePlan;
            if (!plan) return "No cable plan is loaded.";
            const have = ["ours", ...Object.keys(alternativesOf(plan))];
            const sol = String(solution) as SolutionId;
            const over = overlay ? (String(overlay) as SolutionId) : null;
            if (!have.includes(sol) || (over && !have.includes(over))) return `This plan has: ${have.join(", ")}.`;
            const { setCableLayer } = useEditor.getState();
            setCableLayer("solution", sol);
            setCableLayer("overlay", over && over !== sol ? over : null);
            return `Showing ${SOLUTION_LABELS[sol]}${over && over !== sol ? ` with ${SOLUTION_LABELS[over]} overlaid` : ""}.`;
        },
    },
    {
        name: "moveCableHub",
        description: "What-if: move one of OUR hubs to (x, y) metres in the plan's coordinates (the same ones the room and hub positions use). The solver keeps every zone, snaps the hub to the nearest allowed spot in its rooms, re-routes, and the editor shows the result. Returns the old and new costs.",
        input_schema: {
            type: "object",
            properties: { hubId: { type: "string" }, x: { type: "number" }, y: { type: "number" } },
            required: ["hubId", "x", "y"],
        },
        handler: async ({ hubId, x, y }) => {
            const before: CablePlan | null = useEditor.getState().doc.cablePlan;
            if (!before?.submission) return "There is no solved plan of ours to change.";
            const id = String(hubId);
            if (!hubIds().includes(id)) return `No hub ${id}. Hubs: ${hubIds().join(", ")}`;
            if (!Number.isFinite(Number(x)) || !Number.isFinite(Number(y))) return "x and y must be numbers (metres).";
            useEditor.getState().setCableLayer("solution", "ours");
            const ok = await moveHub(id, Number(x), Number(y));
            const after = useEditor.getState().doc.cablePlan;
            if (!ok || !after || after === before) return `The move failed: ${useEditor.getState().cableError ?? "unknown error"}`;
            const hub = after.hubs.find((h) => h.hub_id === id);
            return `Moved ${id} to (${hub?.x.toFixed(2)}, ${hub?.y.toFixed(2)}). Before: ${metricsText(before.metrics)}. After: ${metricsText(after.metrics)}.` +
                (after.notice ? ` Note: ${after.notice}` : "") + " Undo restores the previous design.";
        },
    },
];
