// "Play story": walks through how the solver built this design, one step
// every few seconds, using the ordinary layer switches and the solver's own
// explanations as captions. Stopping (or the end) puts the layers back.
import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";

import { useEditor } from "../store";
import { alternativesOf, SOLUTION_LABELS } from "./cablePlan";
import type { CableLayers, CablePlan } from "./cablePlan";
import styles from "./CablePanel.module.css";

const STEP_MS = 4500;

type Step = { caption: string; layers: Partial<CableLayers>; focus: string | null };

function stepsOf(plan: CablePlan): Step[] {
    const ex = plan.explain;
    const counted = plan.rooms.filter((r) => r.room_id).length;
    const base = { solution: "ours", overlay: null, rooms: true, labels: true } as const;
    const steps: Step[] = [
        {
            caption: `${counted} rooms need a node: every living room, bedroom, kitchen and storage room.`,
            layers: { ...base, cables: false, floor: "wood", animate: false },
            focus: null,
        },
        {
            caption: ex?.summary[0] ?? `${plan.hubs.length} hubs, each serving at most 100 m² and 5 nodes.`,
            layers: { ...base, cables: false, floor: "zones" },
            focus: null,
        },
    ];
    for (const h of plan.hubs) {
        const why = ex?.hubs[h.hub_id] ?? [];
        // Its rooms, then where it stands and in what order it visits them.
        const pick = [why[0], why.find((l) => l.startsWith("Stands")), why.find((l) => l.startsWith("Visits"))];
        steps.push({
            caption: `${h.hub_id}: ` + (pick.filter(Boolean).join(" ") || h.sequence.join(" → ")),
            layers: { ...base, cables: true, floor: "zones", animate: true },
            focus: h.hub_id,
        });
    }
    const cost = ex?.summary.find((l) => l.startsWith("J ="));
    const bound = ex?.summary.find((l) => l.startsWith("No design"));
    steps.push({
        caption: [cost, bound].filter(Boolean).join(" ") || `J ${plan.metrics.J?.toFixed(1)}.`,
        layers: { ...base, cables: true, animate: true },
        focus: null,
    });
    const alts = alternativesOf(plan);
    for (const id of ["greedy", "savings"] as const) {
        const a = alts[id];
        if (!a || !a.valid || a.metrics.J == null || plan.metrics.J == null) continue;
        const less = ((a.metrics.J - plan.metrics.J) / a.metrics.J) * 100;
        steps.push({
            caption: `${SOLUTION_LABELS[id]} (grey dashes) on the same plan: ${a.metrics.H} hubs, J ${a.metrics.J.toFixed(1)}. ` +
                (less > 0.05 ? `Ours uses ${less.toFixed(0)}% less.` : "Ours is no worse."),
            layers: { ...base, cables: true, animate: false, overlay: id },
            focus: null,
        });
    }
    return steps;
}

export default function CableStory({ plan }: { plan: CablePlan }) {
    const [step, setStep] = useState<number | null>(null);
    const saved = useRef<{ layers: CableLayers; focus: string | null } | null>(null);
    const steps = useRef<Step[]>([]);

    const stop = () => {
        const s = useEditor.getState();
        if (saved.current) {
            for (const [k, v] of Object.entries(saved.current.layers)) s.setCableLayer(k as keyof CableLayers, v as never);
            s.setCableFocus(saved.current.focus);
        }
        saved.current = null;
        setStep(null);
    };

    const start = () => {
        const s = useEditor.getState();
        saved.current = { layers: s.cableLayers, focus: s.cableFocus };
        steps.current = stepsOf(plan);
        setStep(0);
    };

    // Apply the current step, then move on after a pause.
    useEffect(() => {
        if (step === null) return;
        if (step >= steps.current.length) {
            stop();
            return;
        }
        const s = useEditor.getState();
        const { layers, focus } = steps.current[step];
        for (const [k, v] of Object.entries(layers)) s.setCableLayer(k as keyof CableLayers, v as never);
        s.setCableFocus(focus);
        const t = setTimeout(() => setStep(step + 1), STEP_MS);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [step]);

    // A different plan (or a re-solve) ends the story.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => () => { if (saved.current) stop(); }, [plan]);

    return (
        <>
            <button type="button" className={styles.chip} data-active={step !== null}
                title="Walk through how the solver built this design"
                onClick={() => (step === null ? start() : stop())}>
                {step === null ? <><Play size={13} /> Play story</> : <><Pause size={13} /> Stop</>}
            </button>
            {step !== null && step < steps.current.length && (
                <div className={styles.storyCaption} role="status" aria-live="polite">
                    <span className={styles.storyCount}>{step + 1} / {steps.current.length}</span>
                    {steps.current[step].caption}
                </div>
            )}
        </>
    );
}
