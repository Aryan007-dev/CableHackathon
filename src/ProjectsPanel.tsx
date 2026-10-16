import { useEffect, useState } from "react";

import { useAuth } from "./AuthContext";
import { useEditor } from "./store";
import type { ProjectSummary } from "./store";
import auth from "./AuthPanel.module.css";
import styles from "./ProjectsPanel.module.css";

type Props = {
  // "save" shows the name box first; "open" focuses on the list.
  mode: "save" | "open";
  onClose: () => void;
};

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : "Something went wrong");

// Modal for saving the current design to your account and opening saved ones.
export default function ProjectsPanel({ mode, onClose }: Props) {
  const { user } = useAuth();
  const saveProject = useEditor((s) => s.saveProject);
  const loadProject = useEditor((s) => s.loadProject);
  const deleteProject = useEditor((s) => s.deleteProject);
  const listProjects = useEditor((s) => s.listProjects);
  const newProject = useEditor((s) => s.newProject);
  const currentId = useEditor((s) => s.currentProjectId);
  const currentName = useEditor((s) => s.currentProjectName);

  const [name, setName] = useState(currentName ?? "");
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refresh = async () => setProjects(await listProjects());

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    listProjects()
      .then((list) => {
        if (!cancelled) setProjects(list);
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [user, listProjects]);

  // Run an async action with the busy flag and error display handled once.
  const run = async (action: () => Promise<void>, closeAfter = false) => {
    setError("");
    setBusy(true);
    try {
      await action();
      if (closeAfter) onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    void run(() => saveProject(trimmed), true);
  };

  const handleDelete = (p: ProjectSummary) => {
    if (!window.confirm(`Delete "${p.name}"? This can't be undone.`)) return;
    void run(async () => {
      await deleteProject(p.id);
      await refresh();
    });
  };

  const handleNew = () => {
    if (!window.confirm("Start a new plan? Unsaved changes will be lost.")) return;
    newProject();
    onClose();
  };

  return (
    <div className={auth.overlay} onClick={onClose}>
      <div className={auth.modal} onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className={auth.closeButton} aria-label="Close">
          ×
        </button>
        <h2 className={auth.title}>{mode === "save" ? "Save your plan" : "Your plans"}</h2>

        {!user ? (
          <p className={styles.hint}>Log in or sign up (top right) to save plans to your account.</p>
        ) : (
          <>
            <form onSubmit={handleSave} className={styles.section}>
              <label htmlFor="project-name" className={auth.label}>
                {currentId ? "Save changes to" : "Save as"}
              </label>
              <div className={styles.row}>
                <input
                  id="project-name"
                  className={`${auth.input} ${styles.grow}`}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Living room v1"
                  autoFocus={mode === "save"}
                  required
                />
                <button type="submit" className={auth.submitButton} style={{ width: "auto", padding: "0 1.25rem" }} disabled={busy}>
                  {busy ? "…" : "Save"}
                </button>
              </div>
            </form>

            {error && <div className={auth.error}>{error}</div>}

            <div className={styles.section}>
              {projects.length === 0 ? (
                <div className={styles.empty}>No saved plans yet.</div>
              ) : (
                <ul className={styles.list}>
                  {projects.map((p) => (
                    <li key={p.id} className={styles.item} data-current={p.id === currentId}>
                      <button
                        type="button"
                        className={styles.open}
                        disabled={busy}
                        onClick={() => void run(() => loadProject(p.id), true)}
                      >
                        <span className={styles.name}>{p.name}</span>
                        <span className={styles.date}>{new Date(p.updated_at).toLocaleString()}</span>
                      </button>
                      <button
                        type="button"
                        className={styles.delete}
                        disabled={busy}
                        onClick={() => handleDelete(p)}
                        aria-label={`Delete ${p.name}`}
                      >
                        Delete
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <button type="button" className={styles.secondary} style={{ height: 36 }} onClick={handleNew}>
              + New plan
            </button>
          </>
        )}
      </div>
    </div>
  );
}
