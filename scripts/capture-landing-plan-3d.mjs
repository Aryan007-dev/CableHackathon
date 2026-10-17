// Record the real Plan 494 editor transition for the landing-page preview.
// Usage: node scripts/capture-landing-plan-3d.mjs http://127.0.0.1:5173/editor
import { spawn } from "node:child_process";
import { copyFile, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import puppeteer from "puppeteer";

const editorUrl = process.argv[2] ?? "http://127.0.0.1:5173/editor";
const outputDir = resolve("public/landing");
const workDir = await mkdtemp(join(tmpdir(), "gridmind-plan-494-"));
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

function encodeVideo(frameList, output) {
  return new Promise((resolveEncode, rejectEncode) => {
    const encoder = spawn("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0",
      "-i", frameList, "-vf", "fps=20,format=yuv420p", "-c:v", "libx264",
      "-preset", "medium", "-crf", "25", "-movflags", "+faststart", output,
    ], { stdio: ["ignore", "inherit", "inherit"] });
    encoder.on("error", rejectEncode);
    encoder.on("exit", (code) => code === 0 ? resolveEncode() : rejectEncode(new Error(`ffmpeg exited ${code}`)));
  });
}

let browser;
try {
  browser = await puppeteer.launch({ headless: true, args: ["--enable-webgl", "--use-gl=angle", "--use-angle=swiftshader"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 675, deviceScaleFactor: 1 });
  await page.goto(editorUrl, { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.waitForSelector('select[aria-label="Cable plan"]');
  await page.select('select[aria-label="Cable plan"]', "494");
  await page.evaluate(() => [...document.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Got it")?.click());
  await page.addStyleTag({ content: ".editor-app > header, .editor-viewport > aside, .chat-panel, .catalog-panel, .inspector-panel { display: none !important; }" });
  await sleep(650);

  const client = await page.createCDPSession();
  const frames = [];
  let pending = Promise.resolve();
  let lastSavedAt = -Infinity;
  client.on("Page.screencastFrame", ({ data, metadata, sessionId }) => {
    pending = pending.then(async () => {
      const timestamp = metadata.timestamp ?? Date.now() / 1000;
      if (timestamp - lastSavedAt >= 1 / 24) {
        const path = join(workDir, `frame-${String(frames.length).padStart(4, "0")}.jpg`);
        await writeFile(path, Buffer.from(data, "base64"));
        frames.push({ path, timestamp });
        lastSavedAt = timestamp;
      }
      await client.send("Page.screencastFrameAck", { sessionId });
    });
  });
  await client.send("Page.startScreencast", { format: "jpeg", quality: 83, maxWidth: 1200, maxHeight: 675, everyNthFrame: 1 });
  await sleep(950); // Show the original 2D plan before its walls rise in 3D.
  await page.evaluate(() => [...document.querySelectorAll("button")].find((button) => button.textContent?.trim() === "3D")?.click());
  await sleep(8300); // Walls, doors/windows, then both animated cable rings.
  await client.send("Page.stopScreencast");
  await pending;
  if (frames.length < 20) throw new Error(`Only ${frames.length} frames captured`);

  await mkdir(outputDir, { recursive: true });
  const list = frames.map((frame, index) => {
    const next = frames[index + 1];
    const duration = next ? Math.max(0.02, Math.min(next.timestamp - frame.timestamp, 0.5)) : 0.8;
    return `file '${frame.path}'\nduration ${duration.toFixed(5)}`;
  }).join("\n") + `\nfile '${frames.at(-1).path}'\n`;
  const frameList = join(workDir, "frames.txt");
  await writeFile(frameList, list);
  await encodeVideo(frameList, join(outputDir, "plan-494-3d-build.mp4"));
  await copyFile(frames.at(-1).path, join(outputDir, "plan-494-3d-poster.jpg"));
  console.log(`Recorded ${frames.length} frames over ${(frames.at(-1).timestamp - frames[0].timestamp).toFixed(1)}s`);
} finally {
  await browser?.close();
  await rm(workDir, { recursive: true, force: true });
}
