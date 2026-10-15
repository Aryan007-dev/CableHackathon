// Pure helpers for the ResPlan import panel (no React, no store), so they can
// be unit-tested with `node --test`.

import type { ResPlanPlanSummary } from "./types.ts";

export const ACCEPTED_EXTENSIONS = [".zip", ".pkl", ".pickle"] as const;
export const MAX_DATASET_BYTES = 1024 * 1024 * 1024;

/** Returns an error message, or null if the file looks uploadable. */
export function validateDatasetFile(file: { name: string; size: number }): string | null {
  const name = file.name.toLowerCase();
  if (!ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext))) {
    return `"${file.name}" isn't a ResPlan file. Choose the ResPlan .zip archive or the ResPlan.pkl inside it.`;
  }
  if (file.size === 0) return `"${file.name}" is empty. Choose the full dataset file.`;
  if (file.size > MAX_DATASET_BYTES) return `"${file.name}" is larger than 1 GB, which is far beyond the ResPlan dataset.`;
  return null;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}

/** "Plan 14433", or "Plan #12" when the dataset gave no id. */
export function planLabel(plan: ResPlanPlanSummary): string {
  return plan.id != null ? `Plan ${plan.id}` : `Plan #${plan.index}`;
}

export function categoryLabel(category: string): string {
  return category.replace(/_/g, " ");
}

/** "3 bedroom · 2 bathroom · 1 kitchen", most rooms first. */
export function roomSummary(plan: ResPlanPlanSummary): string {
  return Object.entries(plan.rooms)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name, count]) => `${count} ${categoryLabel(name)}`)
    .join(" · ");
}

function singular(word: string): string {
  return word.length > 3 && word.endsWith("s") ? word.slice(0, -1) : word;
}

/**
 * Filters plans by a free-text query. Every term must match:
 *   - a number matches the plan id or list index ("14433", "#12")
 *   - "3 bedroom" / "bedroom:3" / "3bed" matches plans with exactly that many
 *   - any other word matches a room category, split or unit type ("stair", "test")
 */
export function filterPlans(plans: ResPlanPlanSummary[], query: string): ResPlanPlanSummary[] {
  const words = query.toLowerCase().replace(/,/g, " ").split(/\s+/).filter(Boolean);
  if (words.length === 0) return plans;

  type Term = (p: ResPlanPlanSummary) => boolean;
  const terms: Term[] = [];
  const matchesCategory = (p: ResPlanPlanSummary, word: string) =>
    Object.keys(p.rooms).some((name) => name.startsWith(singular(word)));
  const countOf = (p: ResPlanPlanSummary, word: string) =>
    Object.entries(p.rooms)
      .filter(([name]) => name.startsWith(singular(word)))
      .reduce((sum, [, n]) => sum + n, 0);

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const next = words[i + 1];

    const pair = word.match(/^([a-z_]+):(\d+)$/) ?? null;
    const glued = word.match(/^(\d+)([a-z_]+)$/) ?? null;
    if (pair) {
      const [, cat, n] = pair;
      terms.push((p) => countOf(p, cat) === Number(n));
    } else if (glued) {
      const [, n, cat] = glued;
      terms.push((p) => countOf(p, cat) === Number(n));
    } else if (/^#?\d+$/.test(word) && next && /^[a-z_]+$/.test(next)) {
      const n = Number(word.replace("#", ""));
      terms.push((p) => countOf(p, next) === n);
      i++;
    } else if (/^#\d+$/.test(word)) {
      const n = Number(word.slice(1));
      terms.push((p) => p.index === n);
    } else if (/^\d+$/.test(word)) {
      const n = Number(word);
      terms.push((p) => p.id === n || p.index === n || String(p.id ?? "").startsWith(word));
    } else {
      terms.push(
        (p) =>
          matchesCategory(p, word) ||
          (p.split ?? "").startsWith(word) ||
          (p.unitType ?? "").toLowerCase().includes(word) ||
          "plan".startsWith(word),
      );
    }
  }
  return plans.filter((p) => terms.every((t) => t(p)));
}
