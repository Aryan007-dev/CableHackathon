import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Check, FileArchive, Loader2, RefreshCw, Search, Upload, X } from "lucide-react";

import { useResPlan } from "./resplanStore";
import { categoryLabel, filterPlans, formatBytes, planLabel, roomSummary, validateDatasetFile } from "./planUtils";
import type { ResPlanPlanSummary } from "./types";
import styles from "./ImportResPlanModal.module.css";

const ICON = { size: 18, strokeWidth: 1.75 } as const;
const ROW_HEIGHT = 60;
const OVERSCAN = 6;

type Props = { onClose: () => void };

export default function ImportResPlanModal({ onClose }: Props) {
  const status = useResPlan((s) => s.status);
  const index = useResPlan((s) => s.index);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Escape closes; focus moves into the dialog and back out on close.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, [onClose]);

  return (
    <div className={styles.overlay} onMouseDown={onClose}>
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="resplan-title"
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className={styles.header}>
          <div>
            <h2 id="resplan-title" className={styles.title}>Import ResPlan Dataset</h2>
            <p className={styles.subtitle}>
              Upload the ResPlan archive, then choose one floor plan to work from.
            </p>
          </div>
          <button type="button" className={styles.iconBtn} onClick={onClose} aria-label="Close" title="Close (Esc)">
            <X {...ICON} />
          </button>
        </header>

        {status === "ready" && index ? <PlanBrowser /> : <UploadStep />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 1: choose / drop a file
// ---------------------------------------------------------------------------

function UploadStep() {
  const status = useResPlan((s) => s.status);
  const file = useResPlan((s) => s.file);
  const progress = useResPlan((s) => s.progress);
  const error = useResPlan((s) => s.error);
  const upload = useResPlan((s) => s.upload);
  const cancelUpload = useResPlan((s) => s.cancelUpload);
  const setError = useResPlan((s) => s.setError);

  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const busy = status === "uploading" || status === "processing";

  const take = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (files.length > 1) {
      setError("Drop one file at a time: the ResPlan .zip archive or ResPlan.pkl.");
      return;
    }
    const chosen = files[0];
    const problem = validateDatasetFile(chosen);
    if (problem) setError(problem);
    else void upload(chosen);
  };

  return (
    <div className={styles.body}>
      {busy && file ? (
        <div className={styles.fileCard} aria-live="polite">
          <FileArchive {...ICON} className={styles.fileIcon} />
          <div className={styles.fileInfo}>
            <span className={styles.fileName}>{file.name}</span>
            <span className={styles.fileMeta}>
              {formatBytes(file.size)} ·{" "}
              {status === "uploading" ? `Uploading ${Math.round(progress * 100)}%` : "Reading floor plans…"}
            </span>
            <div className={styles.progress} aria-hidden="true">
              <div
                className={styles.progressFill}
                data-indeterminate={status === "processing"}
                style={{ width: status === "processing" ? "100%" : `${progress * 100}%` }}
              />
            </div>
          </div>
          {status === "processing" && <Loader2 {...ICON} className={styles.spin} aria-hidden="true" />}
          <button type="button" className={styles.secondaryBtn} onClick={cancelUpload}>
            Remove file
          </button>
        </div>
      ) : (
        <div
          className={styles.dropzone}
          data-dragging={dragging}
          onDragEnter={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            take(e.dataTransfer.files);
          }}
        >
          <Upload size={28} strokeWidth={1.5} className={styles.dropIcon} />
          <p className={styles.dropTitle}>Drag the ResPlan dataset here</p>
          <p className={styles.dropHint}>
            Accepts <code>ResPlan.zip</code> (from GitHub or Kaggle) or the <code>ResPlan.pkl</code> inside it.
          </p>
          <button type="button" className={styles.primaryBtn} onClick={() => inputRef.current?.click()}>
            Choose file
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".zip,.pkl,.pickle"
            hidden
            onChange={(e) => {
              take(e.target.files);
              e.target.value = ""; // allow picking the same file again
            }}
          />
        </div>
      )}

      {status === "error" && error && (
        <div className={styles.error} role="alert">
          <AlertCircle {...ICON} />
          <span>{error}</span>
        </div>
      )}

      <p className={styles.note}>
        The file is read by the local dev server and only a list of plans is sent back. Only the official
        ResPlan format is accepted; other pickle contents are refused without being run.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2: browse, search and select
// ---------------------------------------------------------------------------

function PlanBrowser() {
  const index = useResPlan((s) => s.index)!;
  const file = useResPlan((s) => s.file);
  const query = useResPlan((s) => s.query);
  const setQuery = useResPlan((s) => s.setQuery);
  const selectedPlanIndex = useResPlan((s) => s.selectedPlanIndex);
  const selectPlan = useResPlan((s) => s.selectPlan);
  const reset = useResPlan((s) => s.reset);

  const filtered = useMemo(() => filterPlans(index.plans, query), [index, query]);
  const selected = selectedPlanIndex != null ? index.plans[selectedPlanIndex] : null;
  const topCategories = Object.entries(index.categories).slice(0, 6);

  return (
    <div className={styles.body}>
      <div className={styles.summary}>
        <FileArchive {...ICON} className={styles.fileIcon} />
        <div className={styles.fileInfo}>
          <span className={styles.fileName}>{file?.name ?? index.source}</span>
          <span className={styles.fileMeta}>
            {file ? `${formatBytes(file.size)} · ` : ""}
            <strong>{index.planCount.toLocaleString()}</strong> floor plans found
            {topCategories.length > 0 && " · "}
            {topCategories.map(([name, n]) => `${n.toLocaleString()} ${categoryLabel(name)}`).join(", ")}
          </span>
        </div>
        <button type="button" className={styles.secondaryBtn} onClick={reset}>
          <RefreshCw size={16} strokeWidth={1.75} /> Change dataset
        </button>
      </div>

      <div className={styles.browser}>
        <div className={styles.listColumn}>
          <label className={styles.search}>
            <Search size={16} strokeWidth={1.75} aria-hidden="true" />
            <span className={styles.visuallyHidden}>Search floor plans</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ID, room type, or “3 bedroom”"
              autoFocus
            />
          </label>
          <div className={styles.listMeta} aria-live="polite">
            {filtered.length === index.plans.length
              ? `${index.plans.length.toLocaleString()} plans`
              : `${filtered.length.toLocaleString()} of ${index.plans.length.toLocaleString()} plans`}
          </div>
          {filtered.length === 0 ? (
            <div className={styles.empty}>
              <p>No plans match “{query}”.</p>
              <button type="button" className={styles.secondaryBtn} onClick={() => setQuery("")}>
                Clear search
              </button>
            </div>
          ) : (
            <VirtualPlanList plans={filtered} selectedPlanIndex={selectedPlanIndex} onSelect={selectPlan} />
          )}
        </div>

        <PlanPreview plan={selected} />
      </div>
    </div>
  );
}

type ListProps = {
  plans: ResPlanPlanSummary[];
  selectedPlanIndex: number | null;
  onSelect: (planIndex: number) => void;
};

// Renders only the rows in view, so 17,000 plans scroll smoothly.
function VirtualPlanList({ plans, selectedPlanIndex, onSelect }: ListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState(400);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setViewport(el.clientHeight));
    observer.observe(el);
    setViewport(el.clientHeight);
    return () => observer.disconnect();
  }, []);

  // A new search starts at the top.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
    setScrollTop(0);
  }, [plans]);

  const first = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const last = Math.min(plans.length, Math.ceil((scrollTop + viewport) / ROW_HEIGHT) + OVERSCAN);

  const scrollToRow = (row: number) => {
    const el = scrollRef.current;
    if (!el) return;
    const top = row * ROW_HEIGHT;
    if (top < el.scrollTop) el.scrollTop = top;
    else if (top + ROW_HEIGHT > el.scrollTop + el.clientHeight) el.scrollTop = top + ROW_HEIGHT - el.clientHeight;
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const current = plans.findIndex((p) => p.index === selectedPlanIndex);
    let row = current;
    if (e.key === "ArrowDown") row = Math.min(plans.length - 1, current + 1);
    if (e.key === "ArrowUp") row = Math.max(0, current - 1);
    if (e.key === "Home") row = 0;
    if (e.key === "End") row = plans.length - 1;
    onSelect(plans[row].index);
    scrollToRow(row);
  };

  return (
    <div
      ref={scrollRef}
      className={styles.list}
      role="listbox"
      aria-label="Floor plans"
      tabIndex={0}
      aria-activedescendant={selectedPlanIndex != null ? `resplan-plan-${selectedPlanIndex}` : undefined}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      onKeyDown={onKeyDown}
    >
      <div style={{ height: plans.length * ROW_HEIGHT, position: "relative" }}>
        {plans.slice(first, last).map((plan, i) => {
          const isSelected = plan.index === selectedPlanIndex;
          return (
            <div
              key={plan.index}
              id={`resplan-plan-${plan.index}`}
              role="option"
              aria-selected={isSelected}
              className={styles.row}
              data-selected={isSelected}
              style={{ top: (first + i) * ROW_HEIGHT, height: ROW_HEIGHT }}
              onClick={() => onSelect(plan.index)}
            >
              <div className={styles.rowMain}>
                <span className={styles.rowTitle}>
                  {planLabel(plan)}
                  <span className={styles.rowIndex}>#{plan.index}</span>
                </span>
                <span className={styles.rowRooms}>{roomSummary(plan) || "No rooms labelled"}</span>
              </div>
              <div className={styles.rowSide}>
                {plan.area != null && <span>{plan.area.toFixed(0)} m²</span>}
                {isSelected && <Check size={16} strokeWidth={2} className={styles.rowCheck} aria-hidden="true" />}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PlanPreview({ plan }: { plan: ResPlanPlanSummary | null }) {
  if (!plan) {
    return (
      <aside className={styles.preview} aria-label="Selected plan">
        <div className={styles.previewEmpty}>
          <p className={styles.previewEmptyTitle}>No plan selected</p>
          <p>Pick a plan from the list to see its details here.</p>
        </div>
      </aside>
    );
  }

  const rows: [string, string][] = [
    ["Dataset index", `#${plan.index}`],
    ["Plan ID", plan.id != null ? String(plan.id) : "—"],
    ["Rooms", String(plan.roomCount)],
  ];
  if (plan.area != null) rows.push(["Floor area", `${plan.area.toFixed(1)} m²`]);
  if (plan.netArea != null) rows.push(["Net area", `${plan.netArea.toFixed(1)} m²`]);
  if (plan.width != null && plan.height != null) {
    rows.push(["Extent", `${plan.width.toFixed(0)} × ${plan.height.toFixed(0)} units`]);
  }
  if (plan.wallDepth != null) rows.push(["Wall thickness", `${plan.wallDepth.toFixed(1)} units`]);
  if (plan.unitType) rows.push(["Unit type", plan.unitType]);
  if (plan.split) rows.push(["Split", plan.split]);
  if (plan.graphNodes != null) rows.push(["Graph nodes", String(plan.graphNodes)]);
  if (plan.graphEdges != null) rows.push(["Graph edges", String(plan.graphEdges)]);

  return (
    <aside className={styles.preview} aria-label="Selected plan">
      <div className={styles.previewHeader}>
        <span className={styles.badge}>
          <Check size={14} strokeWidth={2} /> Selected
        </span>
        <h3 className={styles.previewTitle}>{planLabel(plan)}</h3>
      </div>

      <div className={styles.placeholder} aria-hidden="true">
        Floor-plan preview
        <span>Drawing the plan comes in the next stage</span>
      </div>

      <dl className={styles.meta}>
        {rows.map(([k, v]) => (
          <div key={k} className={styles.metaRow}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>

      {Object.keys(plan.rooms).length > 0 && (
        <div className={styles.chips}>
          {Object.entries(plan.rooms)
            .sort((a, b) => b[1] - a[1])
            .map(([name, n]) => (
              <span key={name} className={styles.chip}>
                {n} {categoryLabel(name)}
              </span>
            ))}
        </div>
      )}
    </aside>
  );
}
