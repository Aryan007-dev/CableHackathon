// Run: node --test scripts/resplan/tests/
import assert from "node:assert/strict";
import { test } from "node:test";

import { filterPlans, formatBytes, planLabel, roomSummary, validateDatasetFile } from "../../../src/resplan/planUtils.ts";
import type { ResPlanPlanSummary } from "../../../src/resplan/types.ts";

const plans: ResPlanPlanSummary[] = [
  { index: 0, id: 14433, rooms: { bedroom: 3, bathroom: 3, balcony: 2, kitchen: 1, living: 1 }, roomCount: 10, area: 120.8, split: "train" },
  { index: 1, id: 5410, rooms: { bedroom: 1, bathroom: 1, kitchen: 1, living: 1, stair: 1 }, roomCount: 5, area: 54.2, split: "test" },
  { index: 2, id: 17054, rooms: { bedroom: 2, bathroom: 2, balcony: 1, kitchen: 1, living: 1, storage: 1 }, roomCount: 8 },
  { index: 3, id: null, rooms: { bathroom: 1 }, roomCount: 1 },
];
const ids = (list: ResPlanPlanSummary[]) => list.map((p) => p.index);

test("validateDatasetFile accepts the official formats", () => {
  assert.equal(validateDatasetFile({ name: "ResPlan.zip", size: 100_106_537 }), null);
  assert.equal(validateDatasetFile({ name: "ResPlan.PKL", size: 258_453_658 }), null);
  assert.equal(validateDatasetFile({ name: "data.pickle", size: 10 }), null);
});

test("validateDatasetFile rejects wrong type, empty and oversized files", () => {
  assert.match(validateDatasetFile({ name: "plan.png", size: 10 })!, /isn't a ResPlan file/);
  assert.match(validateDatasetFile({ name: "ResPlan.zip", size: 0 })!, /empty/);
  assert.match(validateDatasetFile({ name: "ResPlan.zip", size: 2 * 1024 ** 3 })!, /larger than 1 GB/);
});

test("formatBytes", () => {
  assert.equal(formatBytes(512), "512 B");
  assert.equal(formatBytes(4373), "4.3 KB");
  assert.equal(formatBytes(100_106_537), "95 MB");
  assert.equal(formatBytes(1.5 * 1024 ** 3), "1.5 GB");
});

test("planLabel and roomSummary", () => {
  assert.equal(planLabel(plans[0]), "Plan 14433");
  assert.equal(planLabel(plans[3]), "Plan #3");
  assert.equal(roomSummary(plans[0]), "3 bathroom · 3 bedroom · 2 balcony · 1 kitchen · 1 living");
});

test("empty query returns every plan", () => {
  assert.equal(filterPlans(plans, "   "), plans);
});

test("search by id, id prefix and #index", () => {
  assert.deepEqual(ids(filterPlans(plans, "14433")), [0]);
  assert.deepEqual(ids(filterPlans(plans, "170")), [2]);
  assert.deepEqual(ids(filterPlans(plans, "#3")), [3]);
  assert.deepEqual(ids(filterPlans(plans, "99999")), []);
});

test("search by room category, plural and partial", () => {
  assert.deepEqual(ids(filterPlans(plans, "stair")), [1]);
  assert.deepEqual(ids(filterPlans(plans, "balconies")), []); // "balconie" isn't a prefix of balcony
  assert.deepEqual(ids(filterPlans(plans, "balcony")), [0, 2]);
  assert.deepEqual(ids(filterPlans(plans, "Kitchen")), [0, 1, 2]);
});

test("search by room count in several spellings", () => {
  assert.deepEqual(ids(filterPlans(plans, "3 bedroom")), [0]);
  assert.deepEqual(ids(filterPlans(plans, "2 bedrooms")), [2]);
  assert.deepEqual(ids(filterPlans(plans, "bedroom:1")), [1]);
  assert.deepEqual(ids(filterPlans(plans, "2bed")), [2]);
});

test("terms combine with AND, and split names match", () => {
  assert.deepEqual(ids(filterPlans(plans, "balcony 2 bedroom")), [2]);
  assert.deepEqual(ids(filterPlans(plans, "test")), [1]);
  assert.deepEqual(ids(filterPlans(plans, "stair, 3 bedroom")), []);
});
