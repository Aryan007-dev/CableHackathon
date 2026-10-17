import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { bendSpansOfRing, bendsOfRing, featuresByHub } from "../../../src/cable/cableFeatures.ts";
import type { FeaturePlan } from "../../../src/cable/cableFeatures.ts";

test("closed-ring bends ignore duplicate vertices and include the turn at the hub", () => {
    assert.deepEqual(bendsOfRing([[0, 0], [1, 0], [1, 0], [1, 1], [0, 1], [0, 0]]),
        [[0, 0], [1, 0], [1, 1], [0, 1]]);
});

test("bend overlays follow both cable legs without consuming the whole run", () => {
    const spans = bendSpansOfRing([[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]);
    assert.equal(spans.length, 4);
    assert.deepEqual(spans[1], [[0.78, 0], [1, 0], [1, 0.22]]);
});

test("crossings belong to each ring they touch, and overlaps to their route", () => {
    const plan = {
        hubs: [
            { hub_id: "H1", ring: [[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]] },
            { hub_id: "H2", ring: [[1, -1], [1, 1], [3, 1], [3, -1], [1, -1]] },
        ],
        problems: { crossings: [[1, 0]], overlaps: [[[0.2, 0], [0.8, 0]]] },
    } as FeaturePlan;
    const features = featuresByHub(plan);
    assert.deepEqual(features.H1.crossings, [[1, 0]]);
    assert.deepEqual(features.H2.crossings, [[1, 0]]);
    assert.equal(features.H1.overlaps.length, 1);
    assert.equal(features.H2.overlaps.length, 0);
});

test("sample plan bend markers match the solver's bend count", () => {
    const plan = JSON.parse(readFileSync(new URL("../../../public/cable-plans/494.json", import.meta.url), "utf8")) as FeaturePlan & { metrics: { B: number } };
    const features = featuresByHub(plan);
    assert.equal(Object.values(features).reduce((sum, hub) => sum + hub.bends.length, 0), plan.metrics.B);
    assert.ok(Object.values(features).every((hub) => hub.bendSpans.length === hub.bends.length));
    assert.equal(features.H2.overlaps.length, plan.problems?.overlaps.length);
});
