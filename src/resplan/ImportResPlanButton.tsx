import { useCallback, useState } from "react";
import { DatabaseZap } from "lucide-react";

import ImportResPlanModal from "./ImportResPlanModal";
import { useResPlan } from "./resplanStore";
import { planLabel } from "./planUtils";
import styles from "../Toolbar.module.css";

const ICON = { size: 18, strokeWidth: 1.75 } as const;

// Toolbar entry point for the ResPlan import. Once a plan is chosen, the
// button also shows which one, so the selection stays visible after closing.
export default function ImportResPlanButton() {
  const [open, setOpen] = useState(false);
  const selected = useResPlan((s) =>
    s.index && s.selectedPlanIndex != null ? s.index.plans[s.selectedPlanIndex] : null,
  );
  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <div className={styles.group}>
        <button
          type="button"
          className={styles.btn}
          onClick={() => setOpen(true)}
          title={selected ? `Selected: ${planLabel(selected)}` : "Upload the ResPlan dataset and pick a floor plan"}
        >
          <DatabaseZap {...ICON} /> Import ResPlan Dataset
        </button>
        {selected && (
          <button type="button" className={styles.btn} data-active="true" onClick={() => setOpen(true)} aria-label={`Selected ResPlan plan: ${planLabel(selected)}`}>
            {planLabel(selected)}
          </button>
        )}
      </div>
      {open && <ImportResPlanModal onClose={close} />}
    </>
  );
}
