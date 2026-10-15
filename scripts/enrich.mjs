import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import path from "node:path";

// FIX 2: was "..." (a literal string). ".." means "parent folder", so the
// cache file lives at <repo>/.cache/enrichment.json (enrich.mjs is in scripts/).
const CACHE_FILE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  ".cache",
  "enrichment.json",
);

function loadCache() {
  try {
    return JSON.parse(fs.readFileSync(CACHE_FILE, "utf-8"));
  } catch {
    return {};
  }
}

// Promise-based "sleep" — resolves after `ms` milliseconds.
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Best-effort vision enrichment. Returns the structured attributes, or null if
// anything is missing/unavailable so the caller (catalog pipeline) can skip it
// without failing the whole build.
// FIX 6: added the `assetId` parameter so the cache key is stable across runs.
export async function enrich(thumbPath, assetId) {
  // FIX 1 + FIX 4: read the file FIRST, then hash — you can't hash bytes
  // you haven't read yet, and the cache check below needs the hash.
  let buf;
  try {
    buf = fs.readFileSync(thumbPath);
  } catch (err) {
    console.warn(`  ! cannot read thumbnail ${thumbPath}: ${err.message}`);
    return null;
  }

  // FIX 1: hash the bytes we just read.
  const hash = createHash("sha256").update(buf).digest("hex").slice(0, 16);

  // FIX 3: build a SEPARATE cache key (assetId + hash). The fallback covers
  // the standalone test run where assetId is undefined.
  const cacheKey = `${assetId ?? path.basename(thumbPath)}:${hash}`;

  // FIX 4: now that cacheKey exists, load + check the cache BEFORE any API work.
  const cache = loadCache();
  if (Object.prototype.hasOwnProperty.call(cache, cacheKey)) return cache[cacheKey];

  // FIX 3: renamed from `key` to `apiKey` so it can't collide with cacheKey.
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.warn("  ! GROQ_API_KEY missing — skipping enrichment");
    return null;
  }

  const b64 = buf.toString("base64");
  const dataUrl = `data:image/png;base64,${b64}`;
  const model = process.env.GROQ_VISION_MODEL || "qwen/qwen3.6-27b";

  const messages = [
    {
      role: "system",
      content:
        "You are a furniture catalog assistant. Analyze the single furniture photo and " +
        "extract structured attributes for an e-commerce catalog. Rules: respond ONLY by " +
        "calling the recordFurniture function — never write prose. Pick the closest value " +
        "from each enum. Write `description` as a short, informative paragraph of 4-5" +
        "sentences (what the piece is, its notable form/materials, and typical use). " +
        "Use lowercase single words for `material`, `palette`, and `tags`. " +
        "Include a concise `label` — a human-readable product name (e.g. " +
        "'Mid-Century Walnut Sofa').",
    },
    {
      role: "user",
      content: [
        {
          type: "text",
          text: "Describe this single furniture item: give it a short human-readable product label/name, plus its style, materials, palette, tags, the room it belongs in, the mood, how many seats it has, and a short paragraph (4-5 sentences) describing the piece.",
        },
        { type: "image_url", image_url: { url: dataUrl, detail: "low" } },
      ],
    },
  ];

  const tools = [
    {
      type: "function",
      function: {
        name: "recordFurniture",
        description: "Record structured attributes of one furniture model",
        parameters: {
          type: "object",
          properties: {
            label: {
              type: "string",
              description: "A short human-readable product name, e.g. 'Mid-Century Walnut Sideboard'.",
            },
            style: {
              type: "string",
              enum: [
                "Scandinavian",
                "Mid-Century",
                "Industrial",
                "Japandi",
                "Art Deco",
                "Traditional",
                "Bohemian",
                "Minimalist",
                "Coastal",
                "Glam",
                "Rustic",
                "Contemporary",
              ],
            },
            material: { type: "array", items: { type: "string" } },
            palette: { type: "array", items: { type: "string" } },
            tags: { type: "array", items: { type: "string" } },
            room: {
              type: "string",
              enum: [
                "living room",
                "bedroom",
                "office",
                "dining",
                "outdoor",
                "kids",
              ],
            },
            mood: { type: "string" },
            seats: { type: "integer" },
            description: {
              type: "string",
              description: "A short, informative paragraph (2-3 sentences) describing the piece",
            },
          },
          required: ["style", "material", "room", "description", "label"],
        },
      },
    },
  ];

  const tool_choice = {
    type: "function",
    function: { name: "recordFurniture" },
  };
  const body = { model, messages, tools, tool_choice };

  try {
    // Retry on HTTP 429 (rate limit). The per-minute token budget resets
    // in ~20-30s, so a short backoff gets through without a new model/key.
    let res;
    for (let attempt = 1; attempt <= 4; attempt++) {
      res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          // FIX 3: use the renamed variable here too.
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (res.status !== 429) break; // only retry on rate-limit
      console.warn(`  ! rate limited (429), retry ${attempt}/4 in ${attempt * 5}s`);
      await sleep(attempt * 5000);
    }
    if (res.status === 429) {
      console.warn("  ! still rate limited after retries");
      return null;
    }

    if (!res.ok) {
      const text = await res.text();
      console.warn(`  ! Groq HTTP ${res.status}: ${text.slice(0, 200)}`);
      return null;
    }

    const data = await res.json();
    const msg = data.choices?.[0]?.message;
    if (!msg) {
      console.warn("  ! Groq response had no choices");
      return null;
    }
    const args = msg.tool_calls?.[0]?.function?.arguments;
    if (!args) return null;

    // FIX 5: capture into `result`, save to cache, THEN return — the old
    // version `return`ed before the save lines, so they never ran.
    const result = JSON.parse(args);
    cache[cacheKey] = result;
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
    return result;
  } catch (err) {
    console.warn(`  ! enrichment failed: ${err.message}`);
    return null;
  }
}

// Standalone test guard: only runs when this file is executed directly
// (not when imported by catalog-pipeline.mjs).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const p = process.argv[2];
  if (!p) {
    console.error("usage: node --env-file=.env scripts/enrich.mjs <thumb.png>");
    process.exit(1);
  }
  const buf = fs.readFileSync(p);
  console.log(
    "bytes:",
    buf.length,
    "dataUrl length:",
    `data:image/png;base64,${buf.toString("base64")}`.length,
  );
  enrich(p).then((m) => {
    if (m) console.log(JSON.stringify(m, null, 2));
    else console.log("enrichment returned null (see warnings above)");
  });
}
