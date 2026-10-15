// Shapes returned by POST /api/resplan/index (see scripts/resplan/resplan_index.py).

export type ResPlanPlanSummary = {
  /** Position in the dataset's plan list; stable for a given file. */
  index: number;
  /** The plan's own `id` field from the dataset. */
  id: number | null;
  /** Room category -> number of room polygons, e.g. { bedroom: 3, bathroom: 2 }. */
  rooms: Record<string, number>;
  roomCount: number;
  /** Recorded floor area in m². */
  area?: number;
  netArea?: number;
  /** Wall thickness in drawing units. */
  wallDepth?: number;
  /** Extent of the walls/interior in drawing units (not metres). */
  width?: number;
  height?: number;
  unitType?: string;
  /** "train" | "val" | "test" | "augmented" when the upload included split.json. */
  split?: string;
  /** Room-connectivity graph size, from plan["graph"] in Kaggle builds. */
  graphNodes?: number;
  graphEdges?: number;
};

export type ResPlanIndex = {
  source: string;
  planCount: number;
  /** Room category -> total rooms across the dataset, most common first. */
  categories: Record<string, number>;
  plans: ResPlanPlanSummary[];
};
