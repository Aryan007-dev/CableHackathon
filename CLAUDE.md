# CLAUDE.md — Learning 3D Editor

> **Purpose:** This file is the accumulated knowledge base for building a web-based AI Interior Design Editor. It serves future Claude sessions (and you, the learner) as a single reference for architecture, concepts, gotchas, and current state.

---

## Project Overview

**Product:** AI Interior Design Editor — professional interior designers furnish/light/finish a dimensioned 3D room, then edit by talking to an AI assistant.

**Stack:** React + TypeScript + Vite + three.js + React Three Fiber (R3F) + drei + Zustand + immer

**Repo:** `learnZust/` at `/Users/aryanmaurya/Desktop/Zust/learnZust`
**GitHub:** https://github.com/Aryan007-dev/InteriorEditor3d.git (branch: `main`)

---

## The One Non-Negotiable Rule

**Everything goes through the master list.** No code touches the 3D scene directly. Every change (add, move, delete, recolor, resize) is a store action that mutates the Zustand state, and R3F reactively renders from that state. This is why undo, save, AI commands, and multi-view all stay consistent.

---

## The Four Layers (bottom → top)

| Layer | What | Role |
|-------|------|------|
| **three.js** | The 3D engine | Math, meshes, lights, materials, renderer |
| **React Three Fiber (R3F)** | JSX bindings for three.js | Every three.js class → lowercase tag (`<mesh>`, `<pointLight>`); constructor args → `args` prop; properties → props |
| **drei** | Helper library for R3F | `<Clone>`, `<Environment>`, `<Grid>`, `OrbitControls`, `TransformControls`, `useGLTF`, `useTexture`, `<Text>`, `<Billboard>`, `<Edges>`, `<Outlines>` |
| **React + Zustand** | State & UI | Store holds the truth; React renders from it |

---

## Core Architecture

### Store (`src/store.ts`) — The Spine

- **Types:** `Vec3 = [number,number,number]`, `Quat = [number,number,number,number]`, `Transform = {position:Vec3, rotation:Quat, scale:Vec3}`
- **Node discriminated union:** `BaseNode {id, name, parentId?, transform}` → `WallNode {type:"wall", start, end, height, thickness, materialId}` | `FurnitureNode {type:"furniture", assetId}` | `LightNode {type:"light", lightType, intensity, color}`
- **Document vs Session:** `nodes` (the room) is document state — saved & undone. `selectedIds`, `mode`, are session state — NOT undone, NOT saved.
- **id-keyed Record:** `nodes: Record<string, SceneNode>` — not an array. Lookup by id is O(1); order doesn't matter.
- **Commit funnel:** every mutation goes through `commit()` which snapshots old state via immer `produceWithPatches` → pushes patches + inverse to history for undo/redo.
- **Key actions:** `addNode`, `updateTransform`, `updateNode(id, partial)`, `removeNode`, `moveCorner(from, to)`, `select`, `undo`, `redo`, `setMode`
- **Helper:** `samePoint(a:Vec3, b:Vec3)` — x&z within 1cm → true

### Data Flow

```
User action (click, drag, keypress)
  → Store action (addNode, updateTransform, updateNode, removeNode)
    → commit() → immer produceWithPatches → new state
      → Zustand notifies subscribers
        → R3F re-renders affected components from new state
```

### Catalog (`src/catalog.ts`)

- **Discriminated union:** `CatalogItem = FurnitureItem{kind,label,assetId,url,picture} | WallItem{kind,label} | LightItem{kind,label,lightType}`
- **CATALOG** = `CatalogSection[]` — grouped by category (Sofas, Chairs, Tables, Structure, Lighting)
- **registory** = DERIVED from CATALOG: `Object.fromEntries(CATALOG.flatMap(s=>s.items).filter(isFurniture).map(i=>[i.assetId, i.url]))` — single source of truth, no duplication

### Materials (`src/materials.ts`)

- **Discriminated union:** `Finish = ColorFinish{kind:"color",color} | TextureFinish{kind:"texture",map,normalMap,roughnessMap,repeat}`
- **Registry:** `Record<string, Finish>` — keyed by materialId (e.g., `"wall"`, `"sage"`, `"concrete"`)

---

## Key Concepts & Gotchas Learned

### R3F / three.js

- **Suspense:** Anything that loads a file (useGLTF, useTexture, Environment) SUSPENDS → MUST be inside `<Suspense>` with a fallback
- **Conditional hooks:** Can't call `useTexture` inside an `if`. SOLVE by SPLITTING into separate components (ColorMaterial always renders, TextureMaterial always calls hooks) and picking which to render
- **Pointer events BUBBLE:** `<group onClick={select}>` fires for any child click → use `e.stopPropagation()` to block
- **Raycasting needs geometry:** `<mesh>` without geometry (e.g., a `<pointLight>` inside a bare mesh) cannot be clicked. Add a visible `<sphereGeometry>` + `<meshBasicMaterial>` "bulb"
- **z-fighting:** Two coplanar surfaces at same height → flicker. Cure: separate them ~1cm (floor at y=-0.01, shadow at y=0)
- **Invisible mesh punches black depth-holes:** `transparent opacity={0}` mesh still writes to depth buffer → `depthWrite={false}`
- **Object3D has ONE parent:** `useGLTF` caches & returns same `.scene` → multiple `<primitive>` on one scene = teleport. Fix: use drei `<Clone object={scene}/>` (deep-copies, shares geometry/textures)
- **position vs rotation vs quaternion:** `<group>` takes `position={[x,y,z]}` (Vec3), `rotation={[x,y,z]}` (Euler radians), `quaternion={[x,y,z,w]}` (Quat). Store as quaternion for correctness; bind ALL transform fields or undo/save breaks
- **ARM-packed textures:** Poly Haven packs AO(R), Roughness(G), Metalness(B) into `_arm` file. three.js `roughnessMap` reads the GREEN channel → just point it at the `_arm` file
- **Texture tiling:** `texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(n,n)`
- **Environment:** `<Environment preset="apartment">` — image-based lighting from CDN HDRI. ALSO suspends. presets fetch from external CDN.

### drei Helpers

- **`useGLTF(url)`:** Returns `{scene, nodes, materials, ...}`. The `.scene` is the root Object3D.
- **`<Clone object={scene}/>`:** Deep-copies per instance, shares geometry/textures (N copies ≠ N downloads)
- **`useTexture({map, normalMap, roughnessMap})`:** Object form loads multiple textures at once. Keys match `<meshStandardMaterial>` prop names.
- **`<Grid args={[w,d]}>`:** Default `[1,1]` shows only a tiny "+". Set to floor size. `cellSize`, `cellThickness`, `sectionSize`, `sectionThickness`, `fadeDistance` for appearance.
- **`OrbitControls`:** `maxPolarAngle={Math.PI/2}` prevents camera dipping under floor. `makeDefault` binds to the Canvas.
- **`TransformControls`:** `mode` ("translate"|"rotate"|"scale"), `translationSnap={1}`, `rotationSnap={Math.PI/12}`, `onObjectChange` (live), `onMouseUp` (write-back to store)
- **`<Text>`:** 3D text. `<Billboard>` makes it always face camera — put `position` ON the Billboard, or the text offset rotates
- **`<Edges>`:** Wireframe outline on a mesh. `color` prop. Put INSIDE the mesh, gated behind `selected` condition
- **`<ContactShadows>`:** Grounds objects. Has its OWN catcher plane — does NOT cast onto other meshes

### Zustand + immer

- **`produceWithPatches(state, recipe)`:** Returns `[nextState, patches, inversePatches]`
- **`applyPatches(state, patches)`:** Applies patches to recreate a previous state
- **Undo stack:** `history: {patches, inverse}[]` + `index`. Undo = `applyPatches(current, inverse)` + decrement index.
- **immer mutability illusion:** Inside `produce`, you write mutating code (`d.nodes[id].position[0] = 5`). immer tracks it and produces an immutable result.
- **`Object.assign(d.nodes[id], partial)`:** Generic node update inside produce — merges any partial fields
- **Document vs session:** Split state so undo doesn't wipe your selection. `nodes` + `walls` = document (in `commit`); `selectedIds` + `mode` = session (direct `set()`)

### TypeScript

- **Discriminated unions:** A `type` literal tag (`"wall"`, `"furniture"`, `"light"`) narrows the union. `if (node.type === "light")` → TS knows it's a LightNode inside that block.
- **`Partial<T>`:** All fields of T become optional. `updateNode(id, partial: Partial<SceneNode>)` lets you update any subset.
- **Type predicate:** `.filter((item): item is FurnitureItem => item.kind === "furniture")` — TS narrows the array type after filter.
- **`Record<K,V>`:** An object type with keys K and values V. `Record<string, SceneNode>` = id→node map.
- **`import type`:** Import only the type, erased at runtime.

### React

- **`useEffect`:** Side effects (keyboard listeners, subscriptions). `setup` runs after render; `cleanup` (returned function) runs before re-effect or unmount. **Deps array:** lists values the effect reads — missing deps = stale closure (handler freezes on initial values).
- **Controlled input:** `<input value={state} onChange={e => setState(e.target.value)}/>`. Store→input→store loop.
- **Keys:** Every mapped element needs a stable `key`. Missing key → React reconciles by index → wrong element deleted/moved.

---

## File Map

| File | Role |
|------|------|
| `src/store.ts` | Zustand store — ALL state + actions |
| `src/App.tsx` | Layout: Toolbar + Sidebar + Scene/FloorPlan toggle + Inspector |
| `src/Scene.tsx` | The `<Canvas>` — lights, grid, floor, nodes.map, TransformControls, keyboard listener |
| `src/wall.tsx` | Renders WallNode (box + dimension label billboard + end/move handles) |
| `src/floor.tsx` | Floor plane with tiled PBR textures |
| `src/furniture.tsx` | `<Clone>` of a GLB model |
| `src/SurfaceMaterial.tsx` | ColorMaterial + TextureMaterial + SurfaceMaterial picker — solves conditional-hooks |
| `src/materials.ts` | Finish discriminated union + registry |
| `src/catalog.ts` | CatalogItem union + CATALOG sections + derived registory |
| `src/sidebar.tsx` | Data-driven sidebar — nested map of CATALOG, buttons → addNode |
| `src/Inspector.tsx` | Properties panel for selected node — intensity/color/materialId |
| `src/Toolbar.tsx` | Save/Load/Undo/Redo/Move/Rotate buttons |
| `public/models/` | GLB/glTF furniture assets, organized as `models/<category>/<id>/` |
| `public/textures/` | PBR texture sets (diffuse, normal, roughness/ARM) |

---

## Current State (as of end of Phase 3)

**Done:** Phase 0 (master list, undo, 3D manipulation) ✅ · Phase 1 (room: walls, corner handles, snap, dimension labels) ✅ · Phase 2 (furniture pipeline, GLB loading, Clone, catalog sidebar) ✅ · Phase 3 (lights as nodes, surface materials: paint + textured walls & floor, Inspector) ✅

**Phase 4 (Catalog):** In progress. Asset organization done (`models/<category>/<id>/`). Tables has 3 items; Sofas has 2. Thumbnails (`picture` field on FurnitureItem) exist but empty. Search, card UI, automation (codegen script) → not yet started.

**Phases 5–8:** Views (cameras), Projects/Saving (IndexedDB/cloud), AI Assistant (function-calling LLM over store actions), Hero Render → not yet started.

---

## Teaching Mode Rules

See memory file `teaching-mode-no-code.md`. Summary:
- User is a JS beginner building to LEARN
- **"lets build it" / "lets continue" = TEACH** — describe how, name props/tools, give bare syntax fragments only when grammar is unobvious
- **"do it" / "you do it" / "busywork" / "just fix it" = DELEGATE** — assistant writes the code
- When unsure, default to teaching
- NEVER write solution code unless explicitly delegated

---

## Build Plan Summary (9 Phases)

0. **Foundation** — master list, undo, 3D manipulation (✅)
1. **Room** — walls with dimension labels, corner handles, snap, floor (✅)
2. **Furniture** — GLB pipeline, Clone, catalog sidebar skeleton (✅)
3. **Light & Materials** — lights as nodes, surface materials (paint + textures), Inspector (✅)
4. **Catalog** — thumbnails, content population, search, card UI, automation (🟡 in progress)
5. **Views** — orthographic plan/elevation views, camera presets, smooth transitions
6. **Projects/Saving** — multi-project, IndexedDB/cloud storage, autosave
7. **AI Assistant** — natural language → store actions via LLM function calling (⭐ the differentiator)
8. **Hero Render** — photoreal beauty shots (post-processing, path-tracer, or server-side)

### Phase 7 Architecture (AI Assistant)

The AI never touches three.js directly. It calls the SAME store actions your buttons call (addNode, updateTransform, updateNode, removeNode, moveCorner). Every AI edit is undoable/saveable for free.

Key pieces:
- **Tool definitions** — expose store actions as LLM-callable tools with JSON Schema
- **Scene serialization** — compact text description of current nodes (the model's "eyes")
- **Catalog as vocabulary** — catalog items + materials keys = what the AI can place
- **Chat panel** — messages list + text input
- **Backend proxy** — API key can't live in browser → tiny server/Edge function

Differentiation strategy (from market research):
- The "AI restyle a photo" camp (RoomGPT, InteriorAI) produces pretty lies — uneditable 2D, furniture doesn't exist
- The "3D planner" camp (Coohom, Homestyler) has million-model catalogs + AI copilots, but is heavy CAD
- **Your wedge:** structured, editable, dimensioned products mutated by conversation → "turn a brief into a real, in-budget, buyable, revisable plan" — plus auto-enrichment pipeline (vision model tags assets from thumbnails)

Market reality: "AI edits a 3D room" is not novel in 2026 (Coohom, Homestyler already ship it). Differentiation = a **who**, not a **what** (e.g., independent e-designer, or white-label for one furniture brand).

---

## Everyday Dev Loop

```bash
git add -A
git commit -m "what you changed"
git push
```

Dev server: `npm run dev` (Vite, port from vite.config.ts)
Type check: `npx tsc --noEmit`
