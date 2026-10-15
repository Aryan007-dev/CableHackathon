import { useState } from "react";
import { AlertCircle, Check, ChevronDown, ChevronUp, Download, Loader2, X } from "lucide-react";

import { useEditor } from "../store";
import { downloadJson, exportPdf, exportPng, exportSvg } from "./exportPlan";
import { hubVar } from "./cablePlan";
import type { CableCompare, CableFloor, CableHeight, CableLayers, CableMetrics } from "./cablePlan";
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

// The on/off layers (compare and height are choices, not switches).
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
    const m = plan?.metrics ?? {};
    const naive = plan?.naive_metrics;
    const hasNaive = !!plan?.hubs.some((h) => h.naive_ring);

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
                    {plan?.status === "solved" && plan.checks && (
                        <span className={styles.badge} data-ok={failed.length === 0}>
                            {failed.length === 0 ? <><Check size={12} strokeWidth={2.5} /> valid</> : `${failed.length} rule${failed.length > 1 ? "s" : ""} broken`}
                        </span>
                    )}
                    {plan && plan.status && plan.status !== "solved" && <span className={styles.badge} data-ok={false}>{plan.status}</span>}
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

                    {/* What it costs, and the naive routing's numbers to compare. */}
                    {plan.hubs.length > 0 && (
                        <div className={styles.metrics}>
                            {METRICS.map(({ key, label, title, digits }) => (
                                <div key={key} className={styles.metric} title={title}>
                                    <span className={styles.metricValue}>{fmt(m[key], digits)}</span>
                                    <span className={styles.metricLabel}>{label}</span>
                                    {naive && key !== "H" && (
                                        <span className={styles.metricNaive} title="Each leg routed on its own (before step 7)">
                                            {fmt(naive[key], digits)}
                                        </span>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                    {naive?.J != null && m.J != null && naive.J > 0 && (
                        <p className={styles.note}>
                            Grey numbers: each leg routed on its own. Routing the rings together saves{" "}
                            <strong>{(((naive.J - m.J) / naive.J) * 100).toFixed(0)}%</strong> of J.
                        </p>
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
                        </div>
                        <div className={styles.row}>
                            {hasNaive && (
                                <label className={styles.field}>
                                    Routing
                                    <select value={layers.compare} onChange={(e) => setLayer("compare", e.target.value as CableCompare)}>
                                        <option value="final">Final</option>
                                        <option value="naive">Naive (each leg alone)</option>
                                        <option value="both">Both</option>
                                    </select>
                                </label>
                            )}
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

                    {/* One row per hub: click to inspect its ring. */}
                    {plan.hubs.length > 0 && (
                        <div className={styles.section}>
                            <div className={styles.sectionHead}>
                                <span>Rings</span>
                                {focus && (
                                    <button type="button" className={styles.linkBtn} onClick={() => setFocus(null)}>Show all</button>
                                )}
                            </div>
                            <ul className={styles.hubs}>
                                {plan.hubs.map((h) => (
                                    <li key={h.hub_id}>
                                        <button type="button" className={styles.hub} data-active={focus === h.hub_id}
                                            onClick={() => setFocus(focus === h.hub_id ? null : h.hub_id)}>
                                            <span className={styles.swatch} style={{ background: hubVar(h.hub_id) }} />
                                            <span className={styles.hubName}>{h.hub_id}</span>
                                            <span className={styles.hubMeta}>
                                                {h.sequence.length - 2} node{h.sequence.length === 3 ? "" : "s"} · {h.ring_length_m.toFixed(1)} m
                                            </span>
                                        </button>
                                        {focus === h.hub_id && (
                                            <p className={styles.sequence}>
                                                {h.sequence.join(" → ")}
                                                <br />
                                                Rooms {(h.assigned_rooms ?? []).join(", ")} · hub in {h.room_id}
                                            </p>
                                        )}
                                    </li>
                                ))}
                            </ul>
                            {plan.submission != null && (
                                <p className={styles.hint}>
                                    Drag a hub to move it ({view === "2d" ? "Select tool" : "drag its cabinet"}); the rings are
                                    re-routed. A hub can only stand in the rooms it serves, which light up while you drag.
                                </p>
                            )}
                        </div>
                    )}

                    {/* Every hard rule, as our checker sees it. */}
                    {plan.checks && (
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
