import { useEffect, useRef, useState } from "react";
import { Cable, Loader2, X } from "lucide-react";

import { useEditor } from "../store";
import styles from "../Toolbar.module.css";
import { routeDrawnPlan } from "./cableActions";
import { isCablePlan } from "./cablePlan";
import type { CablePlanSummary } from "./cablePlan";

const ICON = { size: 18, strokeWidth: 1.75 } as const;
// Solved plans exported by solver/solve_file.py --editor into public/.
const PLANS_URL = `${import.meta.env.BASE_URL}cable-plans/`;
const OPEN_FILE = "file";
const DRAWN = "drawn";
const ROUTE_DRAWN = "route-drawn";

// Toolbar menu: show a solved Cable Ring plan, open one from a file, or route
// the plan drawn in 2D. (Plans from the uploaded ResPlan dataset are routed
// from "Import ResPlan Dataset".) How it's drawn lives in the cable panel.
export default function CablePlanControls() {
    const plan = useEditor((s) => s.doc.cablePlan);
    const busy = useEditor((s) => s.cableBusy);
    const setStatus = useEditor((s) => s.setCableStatus);
    const importPlan = useEditor((s) => s.importCablePlan);
    const clearPlan = useEditor((s) => s.clearCablePlan);

    const [available, setAvailable] = useState<CablePlanSummary[]>([]);
    const fileInput = useRef<HTMLInputElement>(null);

    // The list of exported plans. Missing is fine: the other options still work.
    useEffect(() => {
        fetch(`${PLANS_URL}index.json`)
            .then((r) => (r.ok ? r.json() : []))
            .then((list: CablePlanSummary[]) => setAvailable(Array.isArray(list) ? list : []))
            .catch(() => setAvailable([]));
    }, []);

    const load = (data: unknown, source: string) => {
        if (!isCablePlan(data)) {
            setStatus(null, `${source} isn't a cable plan (make one with solver/solve_file.py)`);
            return;
        }
        setStatus(null, null);
        importPlan(data);
    };

    const pick = async (value: string) => {
        if (value === OPEN_FILE) {
            fileInput.current?.click();
            return;
        }
        if (value === ROUTE_DRAWN) {
            await routeDrawnPlan();
            return;
        }
        if (!value || value === DRAWN) return;
        try {
            const r = await fetch(`${PLANS_URL}${value}.json`);
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            load(await r.json(), `Plan ${value}`);
        } catch (e) {
            setStatus(null, `Couldn't load plan ${value}: ${(e as Error).message}`);
        }
    };

    const openFile = async (file: File | undefined) => {
        if (!file) return;
        try {
            load(JSON.parse(await file.text()), file.name);
        } catch {
            setStatus(null, `${file.name} isn't valid JSON`);
        }
    };

    const drawn = plan?.source?.kind === "drawn";
    const current = plan ? (drawn ? DRAWN : String(plan.plan_id)) : "";
    const listed = available.some((p) => String(p.plan_id) === current);

    return (
        <div className={styles.group} role="group" aria-label="Cable plan">
            <label className={`${styles.btn} ${styles.units}`} title={busy ?? "Show a solved Cable Ring plan"}>
                {busy ? <Loader2 {...ICON} /> : <Cable {...ICON} />}
                <select
                    className={styles.select}
                    value={current}
                    disabled={!!busy}
                    onChange={(e) => pick(e.target.value)}
                    aria-label="Cable plan"
                >
                    <option value="">Cable plan…</option>
                    {available.map((p) => (
                        <option key={p.plan_id} value={String(p.plan_id)}>
                            Plan {p.plan_id} · {p.hubs} hub{p.hubs === 1 ? "" : "s"}
                        </option>
                    ))}
                    {plan && !drawn && !listed && <option value={current}>Plan {plan.plan_id}</option>}
                    {drawn && <option value={DRAWN}>Drawn plan</option>}
                    <option value={ROUTE_DRAWN}>{drawn ? "Route the drawn plan again" : "Route the plan I drew"}</option>
                    <option value={OPEN_FILE}>Open file…</option>
                </select>
                <input
                    ref={fileInput}
                    type="file"
                    accept=".json,application/json"
                    hidden
                    onChange={(e) => {
                        openFile(e.target.files?.[0]);
                        e.target.value = ""; // so picking the same file again still fires
                    }}
                />
            </label>
            {plan && (
                <button type="button" className={styles.btn} onClick={clearPlan} aria-label="Remove cable plan" title="Remove cable plan">
                    <X {...ICON} />
                </button>
            )}
        </div>
    );
}
