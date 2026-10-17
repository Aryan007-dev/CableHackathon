import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  addPlanFurnitureItem,
  createElectricalPlacement,
  createPlanDataset,
  exportOrientation,
  getElectricalSchedule,
  getPlanBounds,
  normalizePlanFurniture,
  removePlanFurnitureItems,
  scaleBarMeters,
  screenToPlanPoint,
} from "../../../src/2d/electricalPlan.ts";
import { SYMBOL_BY_ID } from "../../../src/2d/symbolLibrary.ts";
import { isSolutionValidated, roomDimensionEdges, solutionView, solverDeviceDetails, toPlan } from "../../../src/cable/cablePlan.ts";

const place = (symbolId, id, x, y) => {
  const item = createElectricalPlacement(symbolId, id, x, y);
  assert.ok(item);
  return item;
};

test("electrical placement uses real plan coordinates and adds to the plan schedule", () => {
  const outlet = place("electrical-outlet", "outlet-1", 126.25, 83.75);
  const state = addPlanFurnitureItem([], outlet);
  assert.deepEqual([state[0].x, state[0].y], [126.25, 83.75]);
  assert.deepEqual(getElectricalSchedule(state), {
    total: 1,
    byType: [{ label: "Outlet / receptacle", count: 1 }],
  });
});

test("multiple electrical types are counted and deletion updates the schedule", () => {
  const items = [
    place("electrical-outlet", "o1", 0, 0),
    place("electrical-outlet", "o2", 10, 10),
    place("electrical-switch", "s1", 30, 20),
    place("circuit-hvac", "ac1", 80, 70),
    place("electrical-panel", "p1", 120, 90),
  ];
  const schedule = getElectricalSchedule(items);
  assert.equal(schedule.total, 5);
  assert.deepEqual(Object.fromEntries(schedule.byType.map(({ label, count }) => [label, count])), {
    "Dedicated circuit · HVAC": 1,
    "Electrical panel": 1,
    "Light switch": 1,
    "Outlet / receptacle": 2,
  });
  const remaining = removePlanFurnitureItems(items, new Set(["o1", "ac1"]));
  assert.equal(getElectricalSchedule(remaining).total, 3);
  assert.equal(getElectricalSchedule(remaining).byType.some((row) => row.label === "Dedicated circuit · HVAC"), false);
});

test("all electrician device types use the electrical renderer", () => {
  const electrical = Object.values(SYMBOL_BY_ID).filter((symbol) => symbol.category === "Electrical");
  assert.ok(electrical.some((symbol) => symbol.label.includes("Outlet")));
  assert.ok(electrical.some((symbol) => symbol.label.includes("Light switch")));
  assert.ok(electrical.some((symbol) => symbol.label.includes("Ceiling light")));
  assert.ok(electrical.some((symbol) => symbol.label.includes("Smoke alarm")));
  assert.ok(electrical.some((symbol) => symbol.label.includes("Electrical panel")));
  for (const symbol of electrical) assert.equal(symbol.renderer, "electrical");
  assert.equal(SYMBOL_BY_ID["circuit-hvac"].shape, "dedicatedCircuit");
  assert.equal(SYMBOL_BY_ID["circuit-fridge"].shape, "dedicatedCircuit");
  assert.equal(SYMBOL_BY_ID["circuit-oven"].shape, "dedicatedCircuit");
  assert.equal(SYMBOL_BY_ID["circuit-washer"].shape, "dedicatedCircuit");
  assert.equal(SYMBOL_BY_ID["circuit-water-heater"].shape, "dedicatedCircuit");
});

test("plan geometry bounds exclude screen whitespace and support negative irregular plans", () => {
  const bounds = getPlanBounds({
    floorPlan: [[-350, -140], [0, -220], [265, 35], [-55, 330]],
    planWalls: [
      { id: "w1", a: [-350, -140], b: [0, -220] },
      { id: "w2", a: [0, -220], b: [265, 35] },
      { id: "w3", a: [265, 35], b: [-55, 330] },
      { id: "w4", a: [-55, 330], b: [-350, -140] },
    ],
    planFurniture: [place("electrical-outlet", "o1", -190, 20)],
  });
  assert.ok(bounds);
  assert.equal(bounds.minX, -350);
  assert.equal(bounds.minY, -220);
  assert.equal(bounds.maxX, 265);
  assert.equal(bounds.maxY, 330);
  assert.equal(bounds.width, 615);
  assert.equal(bounds.height, 550);
});

test("openings and rotated furniture are included in plan bounds", () => {
  const bounds = getPlanBounds({
    planWalls: [{ id: "wall", a: [-100, 0], b: [300, 0] }],
    openings: [{ wallId: "wall", offset: 2, width: 1 }],
    planFurniture: [{ ...place("electrical-panel", "panel", 450, 0), rotation: 45 }],
  });
  assert.ok(bounds);
  assert.ok(bounds.minX <= -100);
  assert.ok(bounds.maxX > 464);
  assert.ok(bounds.minY < 0);
  assert.ok(bounds.maxY > 10);
});

test("empty-device plans remain valid and legacy plan furniture normalizes safely", () => {
  assert.deepEqual(getElectricalSchedule([]), { total: 0, byType: [] });
  assert.equal(getPlanBounds({ floorPlan: [], planWalls: [], planFurniture: [] }), null);
  assert.deepEqual(normalizePlanFurniture(undefined), []);
});

test("serialization restore preserves electrical placements and dataset render/count refer to that plan", () => {
  const plan = {
    id: "plan-1",
    floorPlan: [[-20, -10], [400, -10], [400, 300], [-20, 300]],
    planWalls: [{ id: "wall-1", a: [-20, -10], b: [400, -10] }],
    openings: [],
    planFurniture: [place("electrical-outlet", "outlet-1", 35.5, 44.25), place("circuit-hvac", "ac-1", 155, 160)],
  };
  const restored = JSON.parse(JSON.stringify({ ...plan, planFurniture: normalizePlanFurniture(plan.planFurniture) }));
  assert.deepEqual(restored.planFurniture, plan.planFurniture);
  const dataset = createPlanDataset(restored, "Test plan", "data:image/png;base64,abc", "2026-10-17T00:00:00.000Z");
  assert.equal(dataset.metadata.electricalSchedule.total, 2);
  assert.deepEqual(dataset.plan.planFurniture, plan.planFurniture);
  assert.equal(dataset.render.dataUrl, "data:image/png;base64,abc");
  assert.equal(dataset.render.mimeType, "image/png");
  assert.equal(JSON.parse(JSON.stringify(dataset)).metadata.electricalSchedule.total, 2);
});

test("solver nodes retain room, selected panel, and closed-sequence order", () => {
  const plan = {
    plan_id: 2814,
    units: "m",
    bounds: { min_x: 0, min_y: 0, max_x: 10, max_y: 10 },
    walls: [], doors: [], front_doors: [], windows: [],
    rooms: [
      { kind: "living", label: "Living", area_m2: 40, label_at: [5, 5], shape: { outer: [], holes: [] }, room_id: "R1", hub_id: "H1" },
      { kind: "bedroom", label: "Bedroom 1", area_m2: 20, label_at: [2, 2], shape: { outer: [], holes: [] }, room_id: "R2", hub_id: "H1" },
    ],
    nodes: [
      { node_id: "N1", room_id: "R1", x: 5, y: 5 },
      { node_id: "N2", room_id: "R2", x: 2, y: 2 },
    ],
    hubs: [{ hub_id: "H1", room_id: "R1", x: 4, y: 4, assigned_rooms: ["R1", "R2"], sequence: ["H1", "N2", "N1", "H1"], ring_length_m: 4, ring: [[4, 4], [2, 2], [5, 5], [4, 4]] }],
    metrics: { H: 1, J: 4 },
    status: "solved",
    checks: [{ name: "coverage", passed: true, detail: "" }],
    alternatives: {
      greedy: { label: "Greedy", status: "solved", reason: null, metrics: { H: 1, J: 5 }, valid: false, hubs: [] },
    },
  };
  const devices = solverDeviceDetails(plan);
  assert.deepEqual(devices.map(({ node_id, room_id, roomKind, hubId, sequenceNumber }) => [node_id, room_id, roomKind, hubId, sequenceNumber]), [
    ["N1", "R1", "living", "H1", 2],
    ["N2", "R2", "bedroom", "H1", 1],
  ]);
  assert.equal(solutionView(plan, "greedy").status, "failed");
  assert.equal(isSolutionValidated(plan, "ours"), true);
  assert.equal(isSolutionValidated(plan, "greedy"), false);
  assert.equal(isSolutionValidated({ ...plan, status: undefined, checks: undefined }, "ours"), false);
});

test("room dimension segments stay inside concave rooms and away from holes", () => {
  const room = {
    shape: {
      // A one-metre notch makes the inset of the long lower edge leave the room.
      outer: [[0, 0], [10, 0], [10, 5], [5.5, 5], [5.5, 0.1], [4.5, 0.1], [4.5, 5], [0, 5]],
      holes: [[[1, 1], [2, 1], [2, 2], [1, 2]]],
    },
  };
  const dimensions = roomDimensionEdges(room);
  assert.equal(dimensions.some((edge) => edge.a[1] === 0 && edge.b[1] === 0), false);
});

test("ResPlan geometry and solver rings share one transform and validated closed loops", () => {
  // 17054 is not included in this checkout; 17064 is the closest available
  // real ResPlan artifact. 2814 provides an independent comparison plan.
  for (const id of ["17064", "2814"]) {
    const plan = JSON.parse(readFileSync(new URL(`../../../public/cable-plans/${id}.json`, import.meta.url), "utf8"));
    assert.ok(plan.rooms.length > 0);
    assert.ok(plan.outline.length > 0);
    assert.ok(plan.walls.length > 0);
    assert.ok(plan.doors.length > 0);
    assert.ok(plan.windows.length > 0);
    assert.equal(isSolutionValidated(plan, "ours"), true);
    for (const room of plan.rooms) {
      for (const edge of roomDimensionEdges(room)) {
        assert.ok(edge.length >= 1);
      }
    }
    for (const hub of plan.hubs) {
      assert.deepEqual(hub.ring[0], hub.ring.at(-1));
      for (const [x, y] of hub.ring) {
        const [px, py] = toPlan(plan, [x, y]);
        assert.ok(Number.isFinite(px) && Number.isFinite(py));
      }
    }
    // A node and that same world coordinate in its assigned route must map
    // to the same pixel point; this catches a duplicated axis/origin transform.
    for (const node of plan.nodes) {
      const hub = plan.hubs.find((candidate) => candidate.sequence.includes(node.node_id));
      assert.ok(hub);
      assert.ok(hub.ring.some(([x, y]) => Math.hypot(x - node.x, y - node.y) < 0.002));
      assert.deepEqual(toPlan(plan, [node.x, node.y]), toPlan(plan, hub.ring.find(([x, y]) => Math.hypot(x - node.x, y - node.y) < 0.002)));
    }
  }
});

test("dataset metadata can match generated solver devices and the selected solution", () => {
  const generatedSchedule = { total: 2, byType: [{ label: "Solver device · Living room", count: 1 }, { label: "Solver device · Bedroom", count: 1 }] };
  const dataset = createPlanDataset(
    { id: "p", planFurniture: [], cablePlan: { nodes: [{ node_id: "N1" }, { node_id: "N2" }] } },
    "Solved plan", "data:image/png;base64,abc", "2026-10-17T00:00:00.000Z", "m",
    { solutionId: "ours", electricalSchedule: generatedSchedule, solverDevices: [
      { node_id: "N1", room_id: "R1", roomKind: "living", hubId: "H1", sequenceNumber: 1, x: 3, y: 4 },
      { node_id: "N2", room_id: "R2", roomKind: "bedroom", hubId: "H1", sequenceNumber: 2, x: 6, y: 7 },
    ] },
  );
  assert.equal(dataset.metadata.electricalSchedule.total, 2);
  assert.equal(dataset.metadata.solutionId, "ours");
  assert.deepEqual(dataset.metadata.solverDevices.map((device) => device.node_id), ["N1", "N2"]);
  assert.equal(dataset.render.mimeType, "image/png");
});

test("screen-to-plan conversion and scale bar preserve dimensions across pan and zoom", () => {
  assert.deepEqual(screenToPlanPoint([180, 120], [20, 20], 2), [80, 50]);
  assert.equal(scaleBarMeters(100, 1), 100 / (20 / 0.3048));
  assert.equal(scaleBarMeters(200, 2), scaleBarMeters(100, 1));
  assert.equal(exportOrientation(900, 500), "landscape");
  assert.equal(exportOrientation(500, 900), "portrait");
});
