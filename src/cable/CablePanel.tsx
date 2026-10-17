import { useState } from "react";
import { AlertCircle, Check, ChevronDown, ChevronUp, Download, Loader2, X } from "lucide-react";

import { useEditor } from "../store";
import { downloadJson, exportPdf, exportPng, exportSvg } from "./exportPlan";
import { alternativesOf, hubVar, isSolutionValidated, SOLUTION_LABELS, solutionView } from "./cablePlan";
import type { CableFloor, CableHeight, CableLayers, CableMetrics, CablePlan, SolutionId } from "./cablePlan";
import CableStory from "./CableStory";
import styles from "./CablePanel.module.css";

const ICON = { size: 16, strokeWidth: 1.75 } as const;

// The deck's cost: J = L + 5X + O + 0.5B.
const METRICS: { key: keyof CableMetrics; label: string; title: string; digits: number }[] = [
    { key: "H", label: "Hubs", title: "Hubs (ranked first: fewer is better)", digits: 0 },
    { key: "J", label: "J", title: "Cost J = L + 5X + O + 0.5B", digits: 1 },
    { key: "L", label: "L m", title: "Cable length, metres", digits: 1 },
    { key: "X", label: "X", title: "Crossings (5 each)", digits: 0 },
    { key: "O", label: "O m", title: "Overlap: cable on top of cable, metres", digits: 2 },
    { key: "B", label: "B", title: "Bends (0.5 each)", digits: 0 },
];

const fmt = (v: number | undefined, digits: number) => (v == null ? "–" : v.toFixed(digits));

// The deck's ranking: fewer hubs first, then lower J.
const ranksAbove = (a: CableMetrics, b: CableMetrics) =>
    (a.H ?? Infinity) < (b.H ?? Infinity) || ((a.H ?? Infinity) === (b.H ?? Infinity) && (a.J ?? Infinity) < (b.J ?? Infinity) - 1e-6);

type Column = { id: SolutionId; label: string; metrics: CableMetrics; valid: boolean; reason: string | null };

// Ours and every way we compare it with, as table columns.
function columnsOf(plan: CablePlan): Column[] {
    const ours: Column = {
        id: "ours",
        label: SOLUTION_LABELS.ours,
        metrics: plan.metrics,
        valid: isSolutionValidated(plan, "ours"),
        reason: plan.reason ?? (!plan.checks?.length ? "No validation report was included; validity is unverified." : null),
    };
    const others = Object.entries(alternativesOf(plan)).map(([id, alt]) => ({
        id: id as SolutionId,
        label: SOLUTION_LABELS[id as SolutionId] ?? alt.label,
        metrics: alt.metrics,
        valid: alt.status === "solved" && alt.valid,
        reason: alt.reason,
    }));
    return [ours, ...others];
}

// One sentence: who wins under the deck's ranking, and by how much.
function verdict(columns: Column[]): string | null {
    const [ours, ...others] = columns;
    if (!ours.valid || others.length === 0) return null;
    const beat = others.filter((c) => c.valid && ranksAbove(c.metrics, ours.metrics));
    if (beat.length > 0) {
        const best = beat.reduce((a, b) => (ranksAbove(b.metrics, a.metrics) ? b : a));
        return `${best.label} beats ours on this plan (${best.metrics.H} hubs, J ${best.metrics.J?.toFixed(1)} vs ${ours.metrics.H}, ${ours.metrics.J?.toFixed(1)}).`;
    }
    const parts = others.map((c) => {
        if (!c.valid) return `${c.label} found no valid design`;
        if ((c.metrics.H ?? 0) > (ours.metrics.H ?? 0)) return `${c.label} needs ${c.metrics.H} hubs`;
        const j = c.metrics.J ?? 0;
        const saved = j > 0 ? ((j - (ours.metrics.J ?? 0)) / j) * 100 : 0;
        return saved > 0.05 ? `${saved.toFixed(0)}% less J than ${c.label}` : `ties ${c.label}`;
    });
    return `Ours ranks first: ${parts.join(", ")}.`;
}

// The on/off layers (solution, overlay, height and floor are choices, not switches).
type Switch = { [K in keyof CableLayers]: CableLayers[K] extends boolean ? K : never }[keyof CableLayers];

// Floating panel for the imported cable plan: what it costs, how it's drawn,
// each hub's ring, the rule checks, and saving it. Also shows a solve in
// progress or its error, even before any plan is loaded.
export default function CablePanel({ view }: { view: "2d" | "3d" }) {
    const plan = useEditor((s) => s.doc.cablePlan);
    const layers = useEditor((s) => s.cableLayers);
    const setLayer = useEditor((s) => s.setCableLayer);
    const focus = useEditor((s) => s.cableFocus);
    const setFocus = useEditor((s) => s.setCableFocus);
    const busy = useEditor((s) => s.cableBusy);
    const error = useEditor((s) => s.cableError);
    const setStatus = useEditor((s) => s.setCableStatus);
    const requestScreenshot = useEditor((s) => s.requestScreenshot);
    const [open, setOpen] = useState(true);

    if (!plan && !busy && !error) return null;

    const name = plan ? (plan.source?.kind === "drawn" ? "drawn-plan" : `plan-${plan.plan_id}`) : "plan";
    const title = plan ? (plan.source?.kind === "drawn" ? "Drawn plan" : `Plan ${plan.plan_id}`) : "Cable plan";
    const failed = plan?.checks?.filter((c) => !c.passed) ?? [];
    // The solution on screen (ours or a baseline) and the comparison table.
    const shown = plan ? solutionView(plan, layers.solution) : null;
    const m = shown?.metrics ?? {};
    const columns = plan ? columnsOf(plan) : [];
    const shownValid = plan ? isSolutionValidated(plan, layers.solution) : false;
    const best = (key: keyof CableMetrics) =>
        Math.min(...columns.filter((c) => c.valid && c.metrics[key] != null).map((c) => c.metrics[key] as number));

    const toggle = (layer: Switch, label: string, title: string) => (
        <button
            type="button"
            className={styles.chip}
            data-active={layers[layer]}
            aria-pressed={layers[layer]}
            title={title}
            onClick={() => setLayer(layer, !layers[layer])}
        >
            {label}
        </button>
    );

    return (
        <aside className={styles.panel} aria-label="Cable plan">
            <header className={styles.header}>
                <button type="button" className={styles.titleBtn} onClick={() => setOpen(!open)} aria-expanded={open}>
                    {open ? <ChevronDown {...ICON} /> : <ChevronUp {...ICON} />}
                    <span className={styles.title}>{title}</span>
                    {shown && (
                        <span className={styles.badge} data-ok={shownValid}>
                            {shownValid ? <><Check size={12} strokeWidth={2.5} /> valid</> : layers.solution !== "ours" ? `${SOLUTION_LABELS[layers.solution]} invalid` : plan?.status === "solved" && plan.checks?.length ? `${failed.length} rule${failed.length === 1 ? "" : "s"} broken` : plan?.status == null || plan.status === "solved" ? "unverified" : shown.status ?? "not solved"}
                        </span>
                    )}
                </button>
            </header>

            {busy && (
                <div className={styles.busy} aria-live="polite">
                    <Loader2 {...ICON} className={styles.spin} /> {busy}
                </div>
            )}
            {error && (
                <div className={styles.error} role="alert">
                    <AlertCircle {...ICON} />
                    <span>{error}</span>
                    <button type="button" className={styles.iconBtn} onClick={() => setStatus(busy, null)} aria-label="Dismiss">
                        <X size={14} />
                    </button>
                </div>
            )}

            {plan && open && (
                <div className={styles.body}>
                    {plan.status && plan.status !== "solved" && plan.reason && <p className={styles.note}>{plan.reason}</p>}
                    {plan.warning && <p className={styles.note}>{plan.warning}</p>}
                    {plan.notice && <p className={styles.notice}>{plan.notice}</p>}
                    {layers.solution === "ours" && plan.status === "solved" && !plan.checks?.length && <p className={styles.note} role="status">
                        This plan has no validation report. Its nodes and routes are shown as supplied, but are not marked valid.
                    </p>}
                    {layers.solution !== "ours" && shown && !shownValid && <p className={styles.note} role="alert">
                        {alternativesOf(plan)[layers.solution]?.reason ?? "This comparison failed the solver validation checks. Its route is shown for inspection and is not a valid solution."}
                    </p>}

                    {plan.extended && plan.extended.length > 0 && (
                        <p className={styles.notice} title="The deck can't serve a room over 100 m²; the organisers leave such plans out">
                            Extended rules: {plan.extended.join("; ")}. Outside the deck's rules (adds nodes).
                        </p>
                    )}

                    {/* What the solution on screen costs. */}
                    {shown && shown.hubs.length > 0 && (
                        <div className={styles.metrics}>
                            {METRICS.map(({ key, label, title, digits }) => (
                                <div key={key} className={styles.metric} title={title}>
                                    <span className={styles.metricValue}>{fmt(m[key], digits)}</span>
                                    <span className={styles.metricLabel}>{label}</span>
                                </div>
                            ))}
                        </div>
                    )}
                    {layers.solution !== "ours" && shown?.reason && <p className={styles.note}>{shown.reason}</p>}

                    {/* Ours against the baselines, judged the same way. */}
                    {columns.length > 1 && (
                        <div className={styles.section}>
                            <div className={styles.sectionHead}>
                                <span>Compare</span>
                            </div>
                            <table className={styles.compare}>
                                <thead>
                                    <tr>
                                        <th />
                                        {columns.map((c) => (
                                            <th key={c.id}>
                                                <button type="button" className={styles.colBtn} data-active={layers.solution === c.id}
                                                    title={`Show ${c.label}`} onClick={() => setLayer("solution", c.id)}>
                                                    {c.label}
                                                </button>
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {METRICS.map(({ key, label, title, digits }) => (
                                        <tr key={key}>
                                            <th title={title}>{label}</th>
                                            {columns.map((c) => (
                                                <td key={c.id} data-best={c.valid && c.metrics[key] != null && Math.abs((c.metrics[key] as number) - best(key)) < 1e-6}>
                                                    {c.valid ? fmt(c.metrics[key], digits) : "–"}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                    <tr>
                                        <th>Valid</th>
                                        {columns.map((c) => (
                                            <td key={c.id} title={c.reason ?? undefined}>{c.valid ? "✓" : "✗"}</td>
                                        ))}
                                    </tr>
                                </tbody>
                            </table>
                            {verdict(columns) && <p className={styles.note}>{verdict(columns)}</p>}
                            <div className={styles.row}>
                                <label className={styles.field}>
                                    Show
                                    <select value={layers.solution} onChange={(e) => setLayer("solution", e.target.value as SolutionId)}>
                                        {columns.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                                    </select>
                                </label>
                                <label className={styles.field}>
                                    Overlay
                                    <select value={layers.overlay ?? ""} onChange={(e) => setLayer("overlay", (e.target.value || null) as SolutionId | null)}>
                                        <option value="">None</option>
                                        {columns.filter((c) => c.id !== layers.solution).map((c) => (
                                            <option key={c.id} value={c.id}>{c.label}</option>
                                        ))}
                                    </select>
                                </label>
                            </div>
                        </div>
                    )}

                    {/* Why ours looks the way it does (the solver's own reasons). */}
                    {layers.solution === "ours" && plan.explain && plan.explain.summary.length > 0 && (
                        <details className={styles.section} open>
                            <summary>Why this design</summary>
                            <ul className={styles.why}>
                                {plan.explain.summary.map((line, i) => <li key={i}>{line}</li>)}
                            </ul>
                            <p className={styles.hint}>Click a hub or a ring below for its own reasons.</p>
                        </details>
                    )}

                    {/* How it's drawn. */}
                    <div className={styles.section}>
                        <div className={styles.chips}>
                            {toggle("rooms", "Rooms", "Room floors, walls, doors and windows")}
                            {toggle("labels", "Labels", "Room names and areas")}
                            {toggle("dimensions", "Dimensions", "Each room's wall lengths")}
                            {toggle("cables", "Cables", "Rings, hubs and nodes")}
                            {toggle("problems", "Problems", "Crossings and overlapping cable, in red")}
                            {toggle("animate", "Animate", "A pulse running round each ring, hub first")}
                            {view === "3d" && toggle("cutaway", "Cutaway", "Low walls, so the cables stay in view")}
                            {plan.hubs.length > 0 && <CableStory plan={plan} />}
                        </div>
                        <div className={styles.row}>
                            {view === "3d" && (
                                <label className={styles.field}>
                                    Floor
                                    <select value={layers.floor} onChange={(e) => setLayer("floor", e.target.value as CableFloor)}>
                                        <option value="wood">Wood</option>
                                        <option value="tiles">Tiles</option>
                                        <option value="zones">Zone colours</option>
                                    </select>
                                </label>
                            )}
                            {view === "3d" && (
                                <label className={styles.field}>
                                    Cable at
                                    <select value={layers.height} onChange={(e) => setLayer("height", e.target.value as CableHeight)}>
                                        <option value="floor">Floor</option>
                                        <option value="skirting">Skirting</option>
                                        <option value="ceiling">Ceiling</option>
                                    </select>
                                </label>
                            )}
                        </div>
                    </div>

                    {/* One row per hub of the solution on screen: click to inspect its ring. */}
                    {shown && shown.hubs.length > 0 && (
                        <div className={styles.section}>
                            <div className={styles.sectionHead}>
                                <span>Rings</span>
                                {focus && (
                                    <button type="button" className={styles.linkBtn} onClick={() => setFocus(null)}>Show all</button>
                                )}
                            </div>
                            <ul className={styles.hubs}>
                                {shown.hubs.map((h) => (
                                    <li key={h.hub_id}>
                                        <button type="button" className={styles.hub} data-active={focus === h.hub_id}
                                            onClick={() => setFocus(focus === h.hub_id ? null : h.hub_id)}>
                                            <span className={styles.swatch} style={{ background: hubVar(h.hub_id) }} />
                                            <span className={styles.hubName}>{h.hub_id}</span>
                                            <span className={styles.hubMeta}>
                                                {h.sequence.length - 2} node{h.sequence.length === 3 ? "" : "s"} · {h.ring_length_m.toFixed(1)} m
                                            </span>
                                        </button>
                                        {focus === h.hub_id && (layers.solution === "ours" && plan.explain?.hubs[h.hub_id] ? (
                                            <ul className={`${styles.why} ${styles.sequence}`}>
                                                {plan.explain.hubs[h.hub_id].map((line, i) => <li key={i}>{line}</li>)}
                                            </ul>
                                        ) : (
                                            <p className={styles.sequence}>
                                                {h.sequence.join(" → ")}
                                                <br />
                                                Rooms {(h.assigned_rooms ?? []).join(", ")} · hub in {h.room_id}
                                            </p>
                                        ))}
                                    </li>
                                ))}
                            </ul>
                            {plan.submission != null && layers.solution === "ours" && (
                                <p className={styles.hint}>
                                    Drag a hub to move it ({view === "2d" ? "Select tool" : "drag its cabinet"}); the rings are
                                    re-routed. A hub can only stand in the rooms it serves, which light up while you drag.
                                </p>
                            )}
                        </div>
                    )}

                    {/* Every hard rule, as our checker sees it. */}
                    {plan.checks && layers.solution === "ours" && (
                        <details className={styles.section}>
                            <summary>
                                {failed.length === 0 ? `All ${plan.checks.length} rule checks pass` : `${failed.length} of ${plan.checks.length} rule checks fail`}
                            </summary>
                            <ul className={styles.checks}>
                                {[...failed, ...plan.checks.filter((c) => c.passed)].map((c, i) => (
                                    <li key={i} data-ok={c.passed} title={c.detail}>
                                        {c.passed ? "✓" : "✗"} {c.name}
                                        {!c.passed && c.detail && <span className={styles.detail}>{c.detail}</span>}
                                    </li>
                                ))}
                            </ul>
                        </details>
                    )}

                    {/* Saving it. */}
                    <div className={styles.section}>
                        <div className={styles.sectionHead}>
                            <span>Export</span>
                        </div>
                        <div className={styles.chips}>
                            {view === "2d" ? (
                                <>
                                    <button type="button" className={styles.chip} onClick={() => exportPng(name)}><Download size={13} /> PNG</button>
                                    <button type="button" className={styles.chip} onClick={() => exportSvg(name)}>SVG</button>
                                    <button type="button" className={styles.chip} onClick={() => exportPdf(title)}>PDF</button>
                                </>
                            ) : (
                                <button type="button" className={styles.chip} onClick={requestScreenshot}><Download size={13} /> 3D PNG</button>
                            )}
                            {plan.submission != null && (
                                <button type="button" className={styles.chip} title="The slide-8 submission file"
                                    onClick={() => downloadJson(`${name}-submission.json`, plan.submission)}>Submission</button>
                            )}
                            <button type="button" className={styles.chip} title="Everything the editor draws; open it again from the cable menu"
                                onClick={() => downloadJson(`${name}.json`, plan)}>Plan JSON</button>
                        </div>
                    </div>
                </div>
            )}
        </aside>
    );
}
