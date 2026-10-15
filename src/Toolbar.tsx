import { Box, Camera, FolderOpen, Redo2, Ruler, Save, Square, SquarePlus, Undo2 } from "lucide-react";

import AccountButtons from "./AccountButtons";
import ImportResPlanButton from "./resplan/ImportResPlanButton";
import CablePlanControls from "./cable/CablePlanControls";
import { useEditor, normalizeDoc } from "./store";
import styles from "./Toolbar.module.css";
import type { LengthUnit } from "./units";

type View = "2d" | "3d";

type ToolbarProps = {
  view: View;
  onViewChange: (view: View) => void;
};

const ICON = { size: 18, strokeWidth: 1.75 } as const;

function Toolbar({ view, onViewChange }: ToolbarProps) {
  const doc = useEditor((s) => s.doc);
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const canUndo = useEditor((s) => s.undoStack.length > 0);
  const canRedo = useEditor((s) => s.redoStack.length > 0);
  const projectName = useEditor((s) => s.currentProjectName);

  const addNode = useEditor((s) => s.addNode);
  const cameraMode = useEditor((s) => s.cameraMode);
  const setCameraMode = useEditor((s) => s.setCameraMode);
  const units = useEditor((s) => s.units);
  const setUnits = useEditor((s) => s.setUnits);

  const addFloor = (name: string) =>
    addNode({
      id: crypto.randomUUID(),
      name,
      parentId: null,
      transform: {
        position: [0, 0, 0],
        rotation: [0, 0, 0, 1],
        scale: [1, 1, 1],
      },
      type: "Floor",
      assetId: "laminate",
      width: 5,
      length: 4,
    });

  const save = () => localStorage.setItem("scene", JSON.stringify(doc));

  const load = () => {
    const text = localStorage.getItem("scene");
    if (!text) return;
    useEditor.setState({ doc: normalizeDoc(JSON.parse(text)), undoStack: [], redoStack: [], selectedIds: [] });
  };

  return (
    <header className={styles.bar}>
      {/* LEFT: brand + plan title */}
      <div className={styles.left}>
        <span className={styles.logo}>GridMind </span>
        <div className={styles.title}>
          <span className={styles.titleName}>{projectName ?? "Untitled plan"}</span>
          <span className={styles.titleNote}>Save keeps a copy in this browser</span>
        </div>
      </div>

      {/* MIDDLE: what you're looking at */}
      <div className={styles.center}>
        <div className={styles.group} role="group" aria-label="View">
          <button
            type="button"
            className={styles.btn}
            data-active={view === "2d"}
            aria-pressed={view === "2d"}
            onClick={() => onViewChange("2d")}
          >
            <Square {...ICON} /> 2D
          </button>
          <button
            type="button"
            className={styles.btn}
            data-active={view === "3d"}
            aria-pressed={view === "3d"}
            onClick={() => onViewChange("3d")}
          >
            <Box {...ICON} /> 3D
          </button>
        </div>

        <div className={styles.group} role="group" aria-label="History">
          <button type="button" className={styles.btn} onClick={undo} disabled={!canUndo} aria-label="Undo" title="Undo">
            <Undo2 {...ICON} />
          </button>
          <button type="button" className={styles.btn} onClick={redo} disabled={!canRedo} aria-label="Redo" title="Redo">
            <Redo2 {...ICON} />
          </button>
        </div>

        <label className={`${styles.group} ${styles.units}`} title="Measurement units">
          <Ruler {...ICON} />
          <select
            className={styles.select}
            value={units}
            onChange={(e) => setUnits(e.target.value as LengthUnit)}
            aria-label="Measurement units"
          >
            <option value="ft">ft</option>
            <option value="m">m</option>
          </select>
        </label>

        <CablePlanControls />

        {/* 3D-only controls */}
        {view === "3d" && (
          <div className={styles.group} role="group" aria-label="3D view">
            <button type="button" className={styles.btn} onClick={() => addFloor("Laminate Floor")} title="Add floor">
              <SquarePlus {...ICON} /> <span className={styles.label}>Add floor</span>
            </button>
            <button
              type="button"
              className={styles.btn}
              data-active={cameraMode === "topdown"}
              aria-pressed={cameraMode === "topdown"}
              title="Look straight down at the room"
              onClick={() => setCameraMode(cameraMode === "topdown" ? "perspective" : "topdown")}
            >
              <Camera {...ICON} /> <span className={styles.label}>Top-down</span>
            </button>
          </div>
        )}
      </div>

      {/* RIGHT: the plan file and your account */}
      <div className={styles.right}>
        <ImportResPlanButton />
        <div className={styles.group} role="group" aria-label="Plan file">
          <button type="button" className={styles.btn} onClick={save} title="Save in this browser">
            <Save {...ICON} /> <span className={styles.label}>Save</span>
          </button>
          <button type="button" className={styles.btn} onClick={load} title="Load from this browser">
            <FolderOpen {...ICON} /> <span className={styles.label}>Load</span>
          </button>
        </div>
        <AccountButtons />
      </div>
    </header>
  );
}

export default Toolbar;
