// Dev-server endpoint for importing the ResPlan dataset.
//
//   POST /api/resplan/index   body: the raw file   header: x-file-name
//
// The upload is streamed to a temp file, then resplan_index.py (standard-library
// Python, with an allowlisted unpickler) lists the plans and their metadata.
// The browser never sees the pickle, only the JSON summary.
//
// The latest upload is kept (until the next one, or the server stops) under a
// random `datasetId` returned with the summary, so the cable solver can read
// a chosen plan from it without a second 100 MB upload:
//
//   POST /api/cable/solve   body: {"datasetId", "index"}        solve that plan
//                                 {"plan": <cable plan JSON>}   re-solve it
//                                 {"plan", "move": {"hub_id", "x", "y"}}
//
// which runs solver/solve_file.py --serve (the solver's own virtualenv).

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createWriteStream, existsSync, rmSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const RESPLAN_ROUTE = "/api/resplan/index";
export const CABLE_SOLVE_ROUTE = "/api/cable/solve";
// The official archive is ~100 MB and the bare pickle ~260 MB.
export const MAX_UPLOAD_BYTES = 1024 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = [".zip", ".pkl", ".pickle"];
const PYTHON_TIMEOUT_MS = 5 * 60 * 1000;

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "resplan_index.py");
const SOLVER_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "solver");
const SOLVE_TIMEOUT_MS = 3 * 60 * 1000;
const MAX_PLAN_BYTES = 20 * 1024 * 1024;

function defaultPython(): string {
  const candidates = process.platform === "win32"
    ? [join(SOLVER_DIR, ".venv", "Scripts", "python.exe"), join(SOLVER_DIR, ".venv", "Scripts", "python")]
    : [join(SOLVER_DIR, ".venv", "bin", "python")];
  return candidates.find(existsSync) ?? (process.platform === "win32" ? "python" : "python3");
}

// The uploads kept for the solver: datasetId -> { dir, file }. Only the latest
// upload is kept; the folder is removed when replaced or when the server exits.
const kept = new Map<string, { dir: string; file: string }>();
const forgetAll = () => {
  for (const { dir } of kept.values()) rmSync(dir, { recursive: true, force: true });
  kept.clear();
};
process.once("exit", forgetAll);

type Next = (err?: unknown) => void;

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

// Streams the request body to `path`, failing once more than `limit` bytes arrive.
function saveBody(req: IncomingMessage, path: string, limit: number): Promise<number> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const out = createWriteStream(path);
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        req.unpipe(out);
        out.destroy();
        reject(Object.assign(new Error("File is larger than 1 GB."), { status: 413 }));
        req.resume();
      }
    });
    req.on("error", reject);
    out.on("error", reject);
    out.on("finish", () => resolve(size));
    req.pipe(out);
  });
}

function runIndexer(python: string, file: string, displayName: string): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(python, ["-I", SCRIPT, file, displayName], { stdio: ["ignore", "pipe", "pipe"] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    const timer = setTimeout(() => child.kill("SIGKILL"), PYTHON_TIMEOUT_MS);
    child.stdout.on("data", (c: Buffer) => stdout.push(c));
    child.stderr.on("data", (c: Buffer) => stderr.push(c));
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout: Buffer.concat(stdout).toString("utf8"), stderr: Buffer.concat(stderr).toString("utf8") });
    });
  });
}

export function createResPlanHandler(options: { python?: string; tempRoot?: string; keep?: boolean } = {}) {
  const python = options.python ?? process.env.RESPLAN_PYTHON ?? defaultPython();
  const keep = options.keep ?? true;

  return async (req: IncomingMessage, res: ServerResponse, _next?: Next) => {
    if (req.method !== "POST") {
      sendJson(res, 405, { error: "Use POST to upload a dataset file." });
      return;
    }

    let fileName = "dataset";
    try {
      fileName = decodeURIComponent(String(req.headers["x-file-name"] ?? "dataset"));
    } catch {
      // keep the default
    }
    if (!ACCEPTED_EXTENSIONS.some((ext) => fileName.toLowerCase().endsWith(ext))) {
      req.resume();
      sendJson(res, 415, { error: "Upload the ResPlan .zip archive or the ResPlan.pkl file inside it." });
      return;
    }
    const declared = Number(req.headers["content-length"] ?? 0);
    if (declared > MAX_UPLOAD_BYTES) {
      req.resume();
      sendJson(res, 413, { error: "File is larger than 1 GB." });
      return;
    }

    const dir = await mkdtemp(join(options.tempRoot ?? tmpdir(), "resplan-"));
    const file = join(dir, "upload.bin");
    let keepDir = false;
    try {
      const size = await saveBody(req, file, MAX_UPLOAD_BYTES);
      if (size === 0) {
        sendJson(res, 400, { error: "The uploaded file is empty." });
        return;
      }

      const { code, stdout, stderr } = await runIndexer(python, file, fileName);
      if (code === 0) {
        if (!keep) {
          sendJson(res, 200, stdout);
          return;
        }
        // Keep this upload for the solver, replacing the previous one.
        forgetAll();
        const datasetId = randomUUID();
        kept.set(datasetId, { dir, file });
        keepDir = true;
        sendJson(res, 200, { ...JSON.parse(stdout), datasetId });
        return;
      }
      let message = "The dataset could not be processed.";
      try {
        message = JSON.parse(stdout).error ?? message;
      } catch {
        if (code === null) message = "Processing took longer than 5 minutes and was stopped.";
        if (stderr) console.error("[resplan] indexer failed:", stderr);
      }
      sendJson(res, 422, { error: message });
    } catch (err) {
      const e = err as NodeJS.ErrnoException & { status?: number };
      if (e.code === "ENOENT" && e.syscall?.startsWith("spawn")) {
        sendJson(res, 500, { error: `Python 3 is needed to read the dataset, but "${python}" was not found. Install Python 3 or set RESPLAN_PYTHON.` });
      } else {
        sendJson(res, e.status ?? 500, { error: e.message || "Upload failed." });
      }
    } finally {
      if (!keepDir) await rm(dir, { recursive: true, force: true });
    }
  };
}

function readBody(req: IncomingMessage, limit: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > limit) {
        reject(Object.assign(new Error("Request is too large."), { status: 413 }));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

// The solver's own virtualenv (solver/.venv), else the platform's system Python.
function solverPython(): string {
  if (process.env.CABLE_SOLVER_PYTHON) return process.env.CABLE_SOLVER_PYTHON;
  return defaultPython();
}

function runSolver(python: string, request: string): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(python, ["solve_file.py", "--serve"], { cwd: SOLVER_DIR, stdio: ["pipe", "pipe", "pipe"] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    const timer = setTimeout(() => child.kill("SIGKILL"), SOLVE_TIMEOUT_MS);
    child.stdout.on("data", (c: Buffer) => stdout.push(c));
    child.stderr.on("data", (c: Buffer) => stderr.push(c));
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout: Buffer.concat(stdout).toString("utf8"), stderr: Buffer.concat(stderr).toString("utf8") });
    });
    child.stdin.end(request);
  });
}

export function createCableSolveHandler(options: { python?: string } = {}) {
  return async (req: IncomingMessage, res: ServerResponse, _next?: Next) => {
    if (req.method !== "POST") {
      sendJson(res, 405, { error: "Use POST." });
      return;
    }
    const python = options.python ?? solverPython();
    try {
      let body: { datasetId?: string; index?: number; plan?: unknown; move?: unknown };
      try {
        body = JSON.parse(await readBody(req, MAX_PLAN_BYTES));
      } catch (e) {
        const status = (e as { status?: number }).status;
        sendJson(res, status ?? 400, { error: status ? (e as Error).message : "The request isn't valid JSON." });
        return;
      }

      // The browser names an upload by its id; only the server knows the path.
      let request: object;
      if (body.datasetId !== undefined) {
        const dataset = kept.get(String(body.datasetId));
        if (!dataset) {
          sendJson(res, 410, { error: "That dataset upload is gone (the dev server restarted, or another file was uploaded). Upload it again." });
          return;
        }
        if (!Number.isInteger(body.index)) {
          sendJson(res, 400, { error: "Say which plan: index must be a whole number." });
          return;
        }
        request = { dataset: dataset.file, index: body.index };
      } else if (body.plan && typeof body.plan === "object") {
        request = { plan: body.plan, ...(body.move ? { move: body.move } : {}) };
      } else {
        sendJson(res, 400, { error: "Send a datasetId and index, or a plan." });
        return;
      }

      const { code, stdout, stderr } = await runSolver(python, JSON.stringify(request));
      if (code === 0) {
        sendJson(res, 200, stdout);
        return;
      }
      let message = "The solver failed.";
      try {
        message = JSON.parse(stdout).error ?? message;
      } catch {
        if (code === null) message = "Solving took longer than 3 minutes and was stopped.";
        if (stderr) console.error("[cable] solver failed:", stderr);
      }
      sendJson(res, 422, { error: message });
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      if (e.code === "ENOENT" && e.syscall?.startsWith("spawn")) {
        sendJson(res, 500, { error: `The solver's Python ("${python}") was not found. Set it up with: cd solver && uv venv && uv pip install -r requirements.txt` });
      } else {
        sendJson(res, 500, { error: e.message || "Solving failed." });
      }
    }
  };
}

export function resplanPlugin() {
  const handler = createResPlanHandler();
  const solve = createCableSolveHandler();
  return {
    name: "resplan-import",
    configureServer(server: any) {
      server.middlewares.use(RESPLAN_ROUTE, handler);
      server.middlewares.use(CABLE_SOLVE_ROUTE, solve);
    },
    configurePreviewServer(server: any) {
      server.middlewares.use(RESPLAN_ROUTE, handler);
      server.middlewares.use(CABLE_SOLVE_ROUTE, solve);
    },
  };
}
