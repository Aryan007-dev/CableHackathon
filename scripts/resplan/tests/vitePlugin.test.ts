// End-to-end test of the dev-server endpoint: real HTTP upload -> Python indexer -> JSON.
// Run: node --test scripts/resplan/tests/
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

import { CABLE_SOLVE_ROUTE, createCableSolveHandler, createResPlanHandler, RESPLAN_ROUTE } from "../vitePlugin.ts";

const fixture = await readFile(new URL("./fixtures/resplan_sample.pkl", import.meta.url));

const solveHandler = createCableSolveHandler();

function serve(handler: ReturnType<typeof createResPlanHandler>): Promise<{ server: Server; url: string }> {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      if (req.url === RESPLAN_ROUTE) void handler(req, res);
      else if (req.url === CABLE_SOLVE_ROUTE) void solveHandler(req, res);
      else res.writeHead(404).end();
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, url: `http://127.0.0.1:${port}${RESPLAN_ROUTE}` });
    });
  });
}

let server: Server;
let url: string;
before(async () => ({ server, url } = await serve(createResPlanHandler())));
after(() => server.close());

type Reply = { error?: string; source?: string; planCount?: number; plans?: { id: number }[]; datasetId?: string };

const upload = (body: string | Uint8Array, name: string, target = url) =>
  fetch(target, { method: "POST", body, headers: { "x-file-name": encodeURIComponent(name) } });
const json = async (res: Response) => (await res.json()) as Reply;

test("indexes an uploaded pickle", async () => {
  const res = await upload(fixture, "ResPlan.pkl");
  assert.equal(res.status, 200);
  const body = await json(res);
  assert.equal(body.source, "ResPlan.pkl");
  assert.equal(body.planCount, 4);
  assert.deepEqual(
    body.plans!.map((p) => p.id),
    [14433, 5410, 17054, 9791],
  );
});

test("rejects unsupported file types before processing", async () => {
  const res = await upload("hello", "notes.txt");
  assert.equal(res.status, 415);
  assert.match((await json(res)).error!, /\.zip archive or the ResPlan\.pkl/);
});

test("rejects empty uploads", async () => {
  const res = await upload(new Uint8Array(), "ResPlan.zip");
  assert.equal(res.status, 400);
  assert.match((await json(res)).error!, /empty/);
});

test("reports indexer errors as 422 with the indexer's message", async () => {
  const res = await upload("definitely not a zip", "ResPlan.zip");
  assert.equal(res.status, 422);
  assert.match((await json(res)).error!, /Unrecognised file/);
});

test("only accepts POST", async () => {
  const res = await fetch(url);
  assert.equal(res.status, 405);
});

test("explains a missing Python install", async () => {
  const broken = await serve(createResPlanHandler({ python: "python-does-not-exist" }));
  try {
    const res = await upload(fixture, "ResPlan.pkl", broken.url);
    assert.equal(res.status, 500);
    assert.match((await json(res)).error!, /Python 3 is needed/);
  } finally {
    broken.server.close();
  }
});

// The cable solver needs solver/.venv (shapely, scipy...); skip these when it isn't set up.
const solverReady = existsSync(new URL("../../../solver/.venv/bin/python", import.meta.url));
const solve = (body: unknown) =>
  fetch(url.replace(RESPLAN_ROUTE, CABLE_SOLVE_ROUTE), { method: "POST", body: JSON.stringify(body) });

test("solves a plan from the kept upload", { skip: !solverReady && "solver/.venv missing" }, async () => {
  const { datasetId } = await json(await upload(fixture, "ResPlan.pkl"));
  assert.ok(datasetId);
  const res = await solve({ datasetId, index: 0 });
  assert.equal(res.status, 200);
  const plan = (await res.json()) as { plan_id: number; status: string; hubs: unknown[]; checks: { passed: boolean }[] };
  assert.equal(plan.plan_id, 14433);
  assert.equal(plan.status, "solved");
  assert.ok(plan.hubs.length > 0);
  assert.ok(plan.checks.every((c) => c.passed));
});

test("refuses an unknown dataset id", async () => {
  const res = await solve({ datasetId: "nope", index: 0 });
  assert.equal(res.status, 410);
});

test("refuses a request with no plan", async () => {
  const res = await solve({ hello: 1 });
  assert.equal(res.status, 400);
});
