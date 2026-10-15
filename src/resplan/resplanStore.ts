// Session state for the ResPlan import: the uploaded file, its plan index and
// the chosen plan. Kept out of the editor's document store on purpose: picking
// a plan doesn't change the room, so it isn't saved or undone. The next stage
// (turning a plan into walls) reads `selectedPlanIndex` / `getSelectedPlan()`.

import { create } from "zustand";

import type { ResPlanIndex, ResPlanPlanSummary } from "./types";

export type ResPlanStatus = "idle" | "uploading" | "processing" | "ready" | "error";

type ResPlanState = {
  status: ResPlanStatus;
  file: { name: string; size: number } | null;
  /** 0–1 while uploading. */
  progress: number;
  error: string | null;
  index: ResPlanIndex | null;
  /** `index` of the chosen plan within `index.plans`. */
  selectedPlanIndex: number | null;
  query: string;

  upload: (file: File) => Promise<void>;
  cancelUpload: () => void;
  reset: () => void;
  selectPlan: (planIndex: number | null) => void;
  setQuery: (query: string) => void;
  setError: (message: string) => void;
};

let activeRequest: XMLHttpRequest | null = null;

export const useResPlan = create<ResPlanState>((set) => ({
  status: "idle",
  file: null,
  progress: 0,
  error: null,
  index: null,
  selectedPlanIndex: null,
  query: "",

  upload: (file) =>
    new Promise<void>((resolve) => {
      activeRequest?.abort();
      set({ status: "uploading", file: { name: file.name, size: file.size }, progress: 0, error: null, index: null, selectedPlanIndex: null, query: "" });

      // XMLHttpRequest rather than fetch: it reports upload progress.
      const xhr = new XMLHttpRequest();
      activeRequest = xhr;
      xhr.open("POST", "/api/resplan/index");
      xhr.setRequestHeader("x-file-name", encodeURIComponent(file.name));
      xhr.responseType = "text";

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) set({ progress: e.loaded / e.total });
      };
      xhr.upload.onload = () => set({ status: "processing", progress: 1 });

      const fail = (message: string) => {
        if (activeRequest === xhr) activeRequest = null;
        set({ status: "error", error: message });
        resolve();
      };

      xhr.onerror = () => fail("Couldn't reach the dev server. Make sure `npm run dev` is running, then try again.");
      xhr.onabort = () => resolve();
      xhr.onload = () => {
        if (activeRequest !== xhr) return resolve();
        let body: unknown = null;
        try {
          body = JSON.parse(xhr.responseText);
        } catch {
          if (xhr.status === 404) {
            return fail("The dataset importer isn't available here. Run the app with `npm run dev`, which hosts the importer.");
          }
          return fail(`The server sent an unexpected reply (HTTP ${xhr.status}).`);
        }
        const data = body as Partial<ResPlanIndex> & { error?: string };
        if (xhr.status !== 200 || data.error) {
          return fail(data.error ?? `Processing failed (HTTP ${xhr.status}).`);
        }
        if (!Array.isArray(data.plans) || data.plans.length === 0) {
          return fail("No floor plans were found in this file.");
        }
        activeRequest = null;
        set({ status: "ready", index: data as ResPlanIndex });
        resolve();
      };

      xhr.send(file);
    }),

  cancelUpload: () => {
    activeRequest?.abort();
    activeRequest = null;
    set({ status: "idle", file: null, progress: 0, error: null });
  },

  reset: () => {
    activeRequest?.abort();
    activeRequest = null;
    set({ status: "idle", file: null, progress: 0, error: null, index: null, selectedPlanIndex: null, query: "" });
  },

  selectPlan: (planIndex) => set({ selectedPlanIndex: planIndex }),
  setQuery: (query) => set({ query }),
  setError: (message) => set({ status: "error", error: message, file: null, index: null, selectedPlanIndex: null }),
}));

/** The chosen plan's summary, for the next stage to build from. */
export function getSelectedPlan(): ResPlanPlanSummary | null {
  const { index, selectedPlanIndex } = useResPlan.getState();
  if (!index || selectedPlanIndex == null) return null;
  return index.plans[selectedPlanIndex] ?? null;
}
