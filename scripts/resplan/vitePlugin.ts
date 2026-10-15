// Dev-server endpoint for importing the ResPlan dataset.
//
//   POST /api/resplan/index   body: the raw file   header: x-file-name
//
// The upload is streamed to a temp file, then resplan_index.py (standard-library
// Python, with an allowlisted unpickler) lists the plans and their metadata.
// The browser never sees the pickle, only the JSON summary.

import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const RESPLAN_ROUTE = "/api/resplan/index";
// The official archive is ~100 MB and the bare pickle ~260 MB.
export const MAX_UPLOAD_BYTES = 1024 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = [".zip", ".pkl", ".pickle"];
const PYTHON_TIMEOUT_MS = 5 * 60 * 1000;

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "resplan_index.py");

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

export function createResPlanHandler(options: { python?: string; tempRoot?: string } = {}) {
  const python = options.python ?? process.env.RESPLAN_PYTHON ?? "python3";

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
    try {
      const size = await saveBody(req, file, MAX_UPLOAD_BYTES);
      if (size === 0) {
        sendJson(res, 400, { error: "The uploaded file is empty." });
        return;
      }

      const { code, stdout, stderr } = await runIndexer(python, file, fileName);
      if (code === 0) {
        sendJson(res, 200, stdout);
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
      await rm(dir, { recursive: true, force: true });
    }
  };
}

export function resplanPlugin() {
  const handler = createResPlanHandler();
  return {
    name: "resplan-import",
    configureServer(server: any) {
      server.middlewares.use(RESPLAN_ROUTE, handler);
    },
    configurePreviewServer(server: any) {
      server.middlewares.use(RESPLAN_ROUTE, handler);
    },
  };
}
