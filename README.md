# AI Interior Design Editor

> **Work in progress.** Core editing and the AI assistant work today; the 2D-to-3D AI furnishing flow is still being built.

A browser-based interior design editor: draw a floor plan in 2D, see it as a furnished 3D room, and edit it by talking to an AI assistant ("put a sofa against the north wall facing the TV").

**Live demo:** https://interior-editor3d.vercel.app

## What it does

- **2D floor plan:** draw walls and rectangular rooms, place doors/windows and furniture symbols, with length labels and wall angles.
- **3D room:** the plan becomes a lit 3D scene (React Three Fiber) with a GLB furniture catalog, swappable wall/floor materials, and move/rotate/scale gizmos.
- **AI assistant:** a chat panel where an LLM edits the room through tool calls.
- **Undo/redo** for every change, whether it came from the user or the AI.
- Supabase auth and Vercel Analytics.

## How the AI assistant works

The model never touches the scene directly. It can only call tools, and every tool goes through the same store actions the UI uses.

- **Agent loop** (`src/ai/chat.ts`): sends the conversation plus a freshly built system prompt each turn, runs any tool calls the model returns, feeds the results back, and stops after 12 turns at most. Every tool call and result is logged.
- **17 JSON-schema tools** (`src/ai/tools.ts`): `addFurniture`, `moveObject`, `rotateObject`, `resizeObject`, `setMaterial`, `addWalls`, `drawRoom`, `addLights`, `findFreeSpace`, `planRoom`, `inspectRoom`, and more.
- **Deterministic guards on model output:** placements are checked against the real room bounds (derived from the walls) and the footprints of existing furniture. A bad placement is refused with an error telling the model how to recover: call `findFreeSpace` for valid spots, and `planRoom` to validate a whole layout before building it.
- **Scene as text** (`src/ai/serialize.ts`, `src/ai/describePlan.ts`): the 3D scene and 2D plan are described to the model in metres, rebuilt every turn so it sees the result of its own edits.
- **Reversible edits:** every mutation goes through one `commit()` funnel that records Immer patches, so any AI change can be undone.
- **Provider-agnostic:** talks to any OpenAI-compatible chat completions API (Gemini, Groq, NVIDIA, Inception, and others) through a small server-side proxy, so API keys never reach the browser.

## Catalog pipeline

`npm run catalog` (`scripts/catalog-pipeline.mjs`) discovers every GLB under `public/models`, measures its bounding box, renders a thumbnail in headless Chrome, and regenerates `src/catalog.models.ts`. An optional vision-LLM step (`scripts/enrich.mjs`) tags each model with structured attributes through a forced tool call; results are cached by content hash, and rate-limit (429) responses are retried with backoff.

## Architecture

```
User action or AI tool call
  → store action (addNode, updateTransform, updateNode, removeNode)
    → commit(): Immer produceWithPatches → patches pushed to undo history
      → Zustand notifies subscribers
        → React Three Fiber re-renders from the new state
```

All document state lives in one Zustand store (`src/store.ts`); nothing edits the three.js scene directly. That single rule is what keeps undo, the AI tools and the 2D/3D views consistent.

## Tech stack

React 19 · TypeScript · Vite · three.js · React Three Fiber · drei · Zustand · Immer · Supabase · Vercel serverless functions · Puppeteer · glTF-Transform

## Running locally

```bash
npm install
npm run dev
```

Create a `.env` in the project root:

```bash
# Chat provider for the dev proxy (vite.config.ts): gemini, groq, nvidia, agentrouter, atria, inception
CHAT_PROVIDER=gemini
GEMINI_API_KEY=...

# Supabase auth
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...

# Where the 3D models and textures are served from (public/ is not committed)
VITE_ASSET_BASE=...

# Optional: vision tagging in the catalog pipeline
GROQ_API_KEY=...
```

Other scripts: `npm run build`, `npm run lint` (oxlint), `npm run preview`, `npm run catalog`.

## Roadmap

- AI furnishing of the 2D plan, converted into the 3D scene
- Automated tests for the AI tools and regression cases from real failures
- Server-side rate limiting on the chat endpoint
