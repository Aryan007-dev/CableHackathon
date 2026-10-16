# Cable Ring solver

Our entry for the **UR Hackathon 2026H2 Cable Ring Challenge**: given a ResPlan
floor plan, choose how many hubs there are and where, which rooms each hub
serves, the order each hub's ring visits its nodes, and the physical cable
route of every closed ring.

The rulebook is `../Cable Ring Challenge - Problem Statement4.pptx` (8 slides
plus speaker notes). Where this document and the deck disagree, the deck wins.
The first text brief we received is out of date: it said 20 devices per panel,
while the deck says **5 nodes per hub**.

---

## Quick start

```bash
cd solver
uv venv --python 3.12 .venv                      # once
uv pip install --python .venv/bin/python -r requirements.txt

.venv/bin/python solve.py 10      # first 10 test plans, with overlay images
.venv/bin/python solve.py 2000    # the whole test split (no images above 50 plans)
.venv/bin/python solve_file.py "../archive (1)/ResPlan.pkl" --all --split test --jobs 6   # the same, 6 at once
.venv/bin/python -m unittest test_solver   # checks on real plans
```

The dataset is expected at `../archive (1)/ResPlan.pkl` with `split.json` next to
it. Both are gitignored, and so are `solver/.venv/` and `solver/out/`.

Output for each plan goes under `out/`:

| Path | What |
|---|---|
| `input/<id>.json` | the stand-in input file (rooms and fixed node points); see [Formats](#formats) |
| `submission/<id>.json` | the submission, in the slide 8 format |
| `report/<id>.json` | status, reason, metrics, and every hard-rule check with pass/fail |
| `png/<id>.png` | overlay showing zones, hub and node ids, visiting order, rings, and violations in red |
| `solve_all.txt` | the summary table from the last full run |

---

## Solving a file

`solve_file.py` runs the solver on the ResPlan dataset as you downloaded it
(the `.zip`, or the `.pkl` inside it), or on one plan's JSON from the editor:

```bash
.venv/bin/python solve_file.py ResPlan.zip --id 2814 --id 12070   # by plan id
.venv/bin/python solve_file.py ResPlan.pkl --index 0              # by position in the file
.venv/bin/python solve_file.py ResPlan.zip --first 20 --split test
.venv/bin/python solve_file.py drawn-plan.json                    # a plan saved from the editor
```

Per plan it writes `submission/<id>.json` (slide 8), `report/<id>.json`
(status, metrics, every rule check) and `editor/<id>.json` under
`out/runs/<file name>/` (or `--out DIR`). `--editor` also adds each result to
the editor's cable menu (`public/cable-plans/`), and `--jobs N` solves N plans
at once, one process each (6 on an 8-core laptop: the whole test split in
about an hour, baselines included). The table it prints shows our
hubs and J next to each comparison's hubs/J: naive (our hubs and orders, each
leg routed alone), greedy and Clarke–Wright (see [Baselines](#baselines)).

A plan with a room over 100 m² can't be served under the deck (its one node
sits on one ring, and a hub takes at most 100 m²), and the organisers leave
such plans out. For our own plans the room is split into ⌈area / 100⌉ parts of
equal area, each with its own node (`bigrooms.py`); the result is flagged
"extended rules" everywhere it appears.

The pickle is read with an allowlist of exactly the classes the official
file uses (shapely `from_wkb`, numpy `dtype`/`scalar`, networkx `Graph` and
its three views); anything else is refused before it can run.

`solve_file.py --serve` reads one JSON request on stdin; that's how the dev
server's `POST /api/cable/solve` (scripts/resplan/vitePlugin.ts) calls it.
The library behind both is `cable_api.py`.

## The editor

Run `npm run dev`. Three ways to get a cable plan on screen:

1. **Import ResPlan Dataset** (toolbar): upload the zip, pick a plan, then
   **Route cables for this plan**. The dev server keeps the upload for the
   session, so routing sends only the plan's position.
2. The **cable menu**: plans exported with `--editor`, "Open file…", or
   **Route the plan I drew**: the solver finds every closed loop of walls
   (rectangles, wall chains, any shape) and gives each room a node; doors
   connect rooms; windows block cable.
3. Dragging a hub (2D with the Select tool, or its cabinet in 3D): the rooms
   it serves light up, since a hub may only stand in those. On release the
   solver keeps the zones and the other hubs, snaps the hub to the nearest
   allowed spot (saying so if it moved) and re-routes. Cmd/Ctrl+Z undoes it.

The cable panel (bottom right) shows H, J, L, X, O, B; the Compare table
(ours against the baselines, see below); **Why this design** (the solver's
own reasons, see [Explanations](#explanations)); layer switches (rooms,
labels, dimensions, cables, problems in red, animated flow, 3D cutaway); and
in 3D the floor (wood, tiles or zone colours, on a slab) and cable height
(floor, skirting, ceiling). Below that: each hub's ring (click one to inspect
it and read its reasons; the rest dim), every rule check, and export: PNG,
SVG and PDF of the 2D plan, a 3D PNG, the submission JSON, and the plan JSON.

**Play story** walks through the design for a demo, a step every few
seconds, captioned from the explanations: the rooms that need nodes, the
zones and why there are that many, each hub with its spot and order, the cost
against its lower bound, then greedy and Clarke–Wright overlaid. Stop (or the
end) puts the layers back.

**AI assistant** (the chat panel, left): while a cable plan is loaded, its
prompt carries the rules, the design, the explanations and the comparison,
and it is told to answer only from them. It has three cable tools:
`focusCableHub` (highlight a ring), `showCableSolution` (draw a baseline,
optionally overlaid) and `moveCableHub` (a live what-if: the hub moves, the
solver re-routes, and the tool returns the old and new costs; Undo reverts).
Code: `src/ai/describeCable.ts`. The deployed `/api/chat` (`api/chat.ts`)
only answers signed-in users: it checks the Supabase session token the
browser sends, so the AI key can't be used by anyone who finds the URL.

Code: `src/cable/` and `src/2d/layers/CablePlanLayer.tsx`.

## Baselines

How good is the solver? `benchmark.py` solves a fixed sample of the test
split (every 16th plan: 102 plans) four ways, all with the same nodes, grid,
checker and ranking (fewest hubs, then J):

- **Ours**: exact zoning, best hub and ring order, all rings routed together (step 7).
- **Naive routing**: our zones, hubs and orders, but each leg routed on its own.
- **Greedy** (`baselines.py`): grow each zone from the biggest unassigned room,
  adding the nearest door-connected room while it fits; hub at the zone's most
  open spot; nodes nearest-first; legs routed on their own.
- **Clarke–Wright** (`baselines.py`): the classic savings algorithm for
  capacitated vehicle routing, with the deck's zone rules: every room starts
  as its own ring, and the door-connected pair whose merge saves the most
  cable is merged while it still fits.

There is no TSP baseline: each ring's order is already exact (at most 5 nodes
per hub, every order tried), so a TSP solver would find the same orders.

| | valid | H | J | L (m) | X | O (m) | B | vs ours: better / tied / worse |
|---|---|---|---|---|---|---|---|---|
| **Ours** | 102 | 1.94 | **41.1** | 32.0 | 0.04 | 0.26 | 17.2 | |
| Naive routing | 102 | 1.94 | 49.6 | 31.9 | 0.85 | 6.15 | 14.5 | 0 / 3 / 99 |
| Greedy | 102 | 1.94 | 54.6 | 34.1 | 1.38 | 5.58 | 16.1 | 0 / 0 / 102 |
| Clarke–Wright | 102 | 1.94 | 49.7 | 32.0 | 0.90 | 5.94 | 14.4 | 0 / 3 / 99 |
| *Lower bound* | | | *35.6* | | | | | |

Ours has 25% less J than greedy and 17% less than Clarke–Wright, ranks first
on 99 of the 102 plans and ties the other 3 (all one-room zones, where there
is nothing to choose); no baseline beats it anywhere. The baselines all find
the same number of hubs on this sample (the door-only zone rule leaves little
room to choose), so the gain comes from hub placement and, above all, routing
the rings together: crossings and overlap almost disappear, at the price of a
few bends.

**How close to optimal?** On every plan, J is above the [lower
bound](#explanations) (no design with the same hubs can cost less on our
grid): 15.3% above on average, 13.8% for the median plan. The bound leaves out
bends at nodes and the turn-rounds of one-node rings, so part of that gap
can't be closed by any design.

An earlier run, before nodes were snapped to the grid, had ours at J 43.8
and lost one plan (8620) to greedy: tiny out-and-back rings where off-centre
nodes forced extra bends. Snapping fixed both.

3 of the 102 plans have a room over 100 m², solved under the extended rules.
In the editor, the cable panel's Compare table shows all four for the plan on
screen; "Show" switches which one is drawn and "Overlay" puts another's rings
underneath in grey.

## Explanations

`explain.py` turns what the solver computed into sentences, for the panel,
the story and the AI assistant. Each one comes from the solver's own numbers,
so it is true of the design shown:

- **Why this many hubs.** Either it is the bound `max(⌈area/100⌉, ⌈nodes/5⌉)`,
  or the rooms that can't share a hub are named with the reason ("Bedrooms
  1–4 and Kitchen each connect only to Living (87 m²), and with it any of
  them is over 100 m²"), and the exact search over every legal zone proves
  nothing smaller exists.
- **How the zoning was chosen**: how many zonings tie at that hub count, and
  that the cheapest few were routed and compared by J.
- **Per hub**: its rooms against the 100 m² / 5 node limits; the doors that
  connect them; each neighbouring room it *didn't* take, and why (over 100 m²,
  5 nodes already, or a different zoning was cheaper); its spot ("of 18,296
  allowed spots this gives the shortest ring; the most open spot, which a
  simple method would pick, adds 19.7 m"); its order against the next best;
  and its ring's L, B, X and O.
- **A lower bound on J.** Each zone's best ring by distance cost (cells walked
  plus 0.5 m per bend inside a leg, from the exact distance fields) can't be
  beaten by any routed ring: routing adds bends at nodes, crossings and
  overlap, never removes length. The cheapest zoning's sum is therefore a
  bound for every design with the same hub count, on our 5 cm grid (and with
  hubs where we allow them: 0.5 m from walls, 10 cm from nodes). It is loose
  for one-node rings (an out-and-back ring must turn round twice, which the
  bound doesn't count), so the gap is largest on plans of tiny zones.

## The rules, and where each is enforced

| Rule (deck) | Solver | Checker (`validate.py`) |
|---|---|---|
| One fixed node per eligible room (living, bedroom, kitchen, storage); **each polygon is one room** | `step1.passage_graph` splits ResPlan's merged living room back into one node per polygon; nodes come from the input file | `input: one node inside every eligible room` |
| Hub capacity: ≤ 100 m² **and** ≤ 5 nodes | `territories.candidate_territories` only lists groups within both limits | `capacity: …` (two checks) |
| Zone: the hub's rooms are connected through doors or open passages only; windows, wall-only adjacency and the entrance don't count | the territory search runs on a passage graph confirmed physically on the grid (`routing.confirm_passages`) | its own passage graph, confirmed with polygons (`validate.passage_graph`) |
| Coverage: every room in exactly one zone | the exact cover search in `territories.best_partitions` | `coverage: …` |
| Ring: H → every assigned node once → same H; no branches | `loops.plan_loop` (Held–Karp order); `solve.py` routes leg by leg | `ring: …` checks, plus "never passes over another node or hub" |
| Free space: inside `inner`, outside walls and **all** windows, axis-aligned, between rooms only through door or opening gaps | `routing.Grid`: a cell is free only if its whole square is clear; A* moves in 4 directions | `free space: …` (three checks, measured on the original polygons) |
| Hub point: inside an eligible room of its own zone, ≥ 0.5 m from walls | `loops.hub_cells` (distance transform plus a safety margin) | `hub: …` (two checks) |
| Ranking: fewest hubs, then J = L + 5X + O + 0.5B, then the smallest area gap | the territory search minimises hubs; ties are compared by cable cost, then area gap; a bend costs 0.5 m in routing | `score_submission` recomputes H, L, X, O, B, J and the gap from the polylines |

The tolerance is **1 mm** everywhere, as in the deck. An invalid plan scores
zero, so wherever the rules left room for interpretation, the solver takes the
conservative option (see [Decisions](#decisions)).

---

## Pipeline

```
plan ──► input (rooms + fixed nodes)
     ──► passage graph (candidate doors/openings, living room split per polygon)
     ──► grid (free cells) ──► confirm passages on the grid
     ──► zones: fewest hubs, ≤100 m², ≤5 nodes, connected  (exact search, ties kept)
     ──► per zone: the 3 best (hub spot, node order) options by cable cost
     ──► step 7: route all rings together, priced by J; rip up and reroute;
                 if crossings remain, try other zones' options
     ──► submission ──► checker + metrics ──► report + overlay
```

| File | Stage |
|---|---|
| `step1.py` | Loading, scale, candidate passage graph, eligible rooms, stand-in node placement. Running it prints a per-plan summary and saves `out/step1_<id>.png`. |
| `routing.py` | The grid, passage confirmation, distance fields (SciPy Dijkstra over (cell, heading) states), A*, and axis-aligned polylines. Running it routes every passage as a smoke test. |
| `territories.py` | Zones: Part A lists every legal group of rooms; Part B is the exact minimum cover search. Running it prints zonings. |
| `loops.py` | Hub cells (0.5 m clearance), and node orders: every order for ≤ 7 nodes (Held–Karp above that). Each order is paired with its best hub spot, and the best few are kept. |
| `refine.py` | Step 7: routes all rings against each other with J prices, then rips up and reroutes. |
| `io_format.py` | Our node placement (the input file) and the slide 8 submission structure. |
| `solve.py` | Runs everything and writes the outputs. |
| `explain.py` | The design's reasons in plain sentences, and the lower bound on J. |
| `baselines.py`, `benchmark.py` | Greedy and Clarke–Wright, and the comparison on a sample. |
| `bigrooms.py` | Extended rules: a room over 100 m² split for two hubs. |
| `cable_api.py`, `solve_file.py` | Reading the dataset safely, the editor's JSON, the command line, `--serve`. |
| `validate.py` | The independent checker and the metrics. It imports nothing from the solver. |
| `resplan_utils.py` | The dataset's own helpers (MIT licence), unchanged. |

### Key ideas

- **Scale.** Every plan is drawn on a canvas of about 256 units, with its own
  scale. `scale = sqrt(inner.area / area)` gives units per metre, about 18 on
  average (5th–95th percentile 12–26). Lengths in metres are units ÷ scale;
  areas in m² are units² ÷ scale². `net_area` is 0 in 32% of plans, so it
  isn't used.
- **The grid.** Cells are about 5 cm (one canvas unit). A cell is free only if its
  *whole square* is inside `inner` and touches no wall, window or entrance.
  Routes run along cell centres, so every route stays at least half a cell from
  every obstacle. That's what makes it safe against a 1 mm checker.
- **Exact zoning.** A plan has at most 10 eligible rooms, so all 2¹⁰ room
  groups can be enumerated. The fewest-hub cover is then found by a search that
  always decides the first uncovered room, and prunes with
  `max(⌈area/100⌉, ⌈nodes/5⌉)`.
- **Hub and order chosen together.** One distance field per node gives the true
  cable cost (cells + 0.5 m per bend) to every cell. A zone has at most 5
  nodes, so every visiting order is tried (a ring and its reverse count once).
  Each order is scored against every candidate hub cell at once with numpy, as
  hub → first + path + last → hub. The best 3 orders are kept.
- **Step 7: rings routed together, priced by J.** Each leg is routed against
  the cable already laid (`routing.Occupancy`):
  - entering a cell along cable running the same way costs +1 per cell (that's
    O, 1 per metre);
  - crossing cable costs +5 m (X);
  - every bend costs +0.5 m, including at a node and where the ring closes at
    the hub (B). Each leg starts in the direction the previous leg arrived.

  So a trip into a one-door room and back out runs on two parallel lines one
  cell apart, which the deck says is not overlap. Then every leg is ripped up
  and rerouted against all the others, up to 4 passes, keeping the pass with the
  lowest real J. If the design still has crossings, each zone's 2nd and 3rd
  orders are tried, because distance alone can't see that an order forces a
  crossing.
- **Fast routing.** Legs are routed with SciPy's compiled Dijkstra on the
  (cell, heading) graph. The graph is built once, and each leg only re-prices
  its edge weights with numpy. Paths cost exactly what the Python A*
  (`find_path`, kept as the readable reference) finds, and it's 14× faster.
- **Nodes on cell centres.** We place the nodes (the organisers don't), at the
  point deepest inside each room, then snapped to the centre of its 5 cm grid
  cell (it moves 2.5 cm at most). Cable runs along cell centres, so a node off
  centre made every leg reaching it jog sideways: two extra bends, 1 point of
  J. Snapping cut average J by about 5% (bends 21.9 → 17.6 per plan on a 24-plan
  sample), with every design still valid.
- **Axis-aligned stubs.** A point that isn't on a cell centre (a hub dragged in
  the editor, a node from an old file) is joined without a diagonal: the first
  and last straight runs are slid sideways to pass exactly through it, inside
  the same row or column of free cells.

---

## What the data taught us

Each of these was found by the checker or by looking at the overlays, and each
is handled in code.

| Finding | Handling |
|---|---|
| The README says coordinates are metres; they're canvas units with a per-plan scale | Use `plan_scale` (the deck confirms this formula) |
| About 91% of the stored graph's `adjacency` edges run through a solid wall | Never use `plan["graph"]`; use `plan_to_graph` and keep only doors and openings |
| About 4% of plans contain invalid (self-intersecting) polygons, which break Shapely set operations | `make_valid` everywhere; the grid tests each layer separately |
| About 8% of door links are really "window" polygons. `plan_to_graph` promotes them to doors, including real windows wrapped round an outside corner | The deck says windows never count, so **all windows block**, and passages are confirmed on the grid |
| Wall stubs drawn inside rooms | Nodes are placed in the room minus walls |
| A wall drawn through a room, splitting it in two | A passage must reach the room's *node*, not just the room |
| Thin strips of a third room drawn over a doorway | Other rooms are shrunk and grown back by one cell (an "opening") before checking |
| Rooms drawn outside the building outline | Reported as infeasible |
| 261 plans have several living-room polygons, merged by `plan_to_graph` | Split back: one room per polygon (deck rule) |
| About 2.7% of plans have a room over 100 m² | Infeasible; the deck says the benchmark excludes them |
| In 513 of the 683 **augmented** plans (rotated/flipped copies) the outline `inner` wasn't transformed with the rest, so rooms lie partly outside it (only 1 such plan in 1,632 test plans) | Nodes go in room ∩ `inner` − walls; balconies are blocked explicitly (they can fall inside a broken outline); the report carries a warning |
| In a small room, the hub's best spot can be the node's own spot (a hub 3 mm from a node) | Hubs keep 2 cells (~10 cm) clear of every node |

All 683 augmented plans were run as a robustness check: **537 valid, 0
invalid**, 113 infeasible, 30 outside the benchmark, 3 with no answer.

---

## Formats

**Input.** The organisers **don't supply node positions**: teams place them
(confirmed 2026-10-16). We place one per eligible room, at the point deepest
inside the room (furthest from its walls), snapped to the centre of its grid
cell. It's a neutral rule, the same for every plan, not tuned to lower J.
`io_format.make_input` writes them to a file in this format:

```json
{"plan_id": 2814, "units": "m", "units_per_metre": 20.48,
 "rooms": [{"room_id": "R01", "name": "bedroom_0", "type": "bedroom", "area_m2": 18.4}],
 "nodes": [{"node_id": "N1", "room_id": "R01", "x": 6.21, "y": 3.94}]}
```

`name` is the room's id in the passage graph (ResPlan category plus polygon
index).

On the test split, 7,324 of 7,356 nodes (99.6%) are at least 0.5 m from every
wall, as the deck describes the organisers' nodes. Of the other 32, 29 are in
"rooms" under 2 m² (drawing errors, excluded from the benchmark) and 3 are in
rooms under 1 m wide, where no point can be 0.5 m clear. Because we take the
point furthest from the walls, our node meets the clearance whenever the room
has any point that does.

**Watch out:** the slide 8 output has node *ids* but no node *coordinates*. A
checker can only verify our rings if it knows where our nodes are, so our
submission carries them (see below and the open questions).

**Submission.** This is exactly the slide 8 structure: `plan_id`, `units`,
`hubs[]` with `hub_id`, `room_id`, `location {x, y}`, `assigned_rooms`,
`assigned_nodes`, `closed_sequence`, `route_segments[]` (`from`, `to`,
`length_m`, `polyline`), `ring_length_m`, and `reported_metrics`. Coordinates
are metres, origin lower-left, y up.

**Extension:** each submission also carries `rooms` (`room_id`, `type`,
`area_m2`) and `nodes` (`node_id`, `room_id`, `x`, `y`). Slide 8 has node ids
but no node coordinates, and we place our own nodes, so without these a checker
couldn't know where `N1` is. Our checker confirms they match the input to 1 mm.

**Report.** `status`, which is one of:
- `solved`;
- `infeasible`: a room is over 100 m² or outside the building;
- `excluded`: no answer found, and the plan breaks one of the organisers'
  benchmark filters, so it shouldn't be in their benchmark;
- `failed`: no answer found for any other reason.

Then `reason`,
`dropped_passages` (links the dataset claimed but a cable can't use), `valid`,
`metrics {H, L, X, O, B, J, area_gap_m2}`, and `checks[]` with
`{name, passed, detail, ref}`. `ref` points at the hub or (hub, segment) a
failure concerns, and the overlay draws those in red.

---

## Metrics (as the deck defines them)

- **L**: the length of every leg of every ring, return legs included.
- **X**: points where two cables meet away from any node or hub, inside one
  ring or between rings, counted once per point.
- **O**: length on the same line: a stretch covered by k legs counts (k − 1)
  times. Computed as total length minus the length of the union. Parallel
  runs on different lines don't count.
- **B**: direction changes around each closed ring, at vertices, nodes and the
  hub. A reversal counts once.
- **J = L + 5X + O + 0.5B**, compared only between designs with the same hub
  count. Ties go to the smaller assigned-area gap between hubs.

---

## Results

See [Results on the test split](#results-on-the-test-split) at the end. The
numbers are filled in from the last full run (`out/solve_all.txt`).

---

## Decisions

These are places where the rules leave room for interpretation. In each case
we chose the reading that can't make a plan invalid.

- **All windows block**, even ones that look like mislabelled doors. (Speaker
  notes: free space is `inner − wall − window`.)
- **A ring never passes over another node or hub.** This isn't forbidden in so
  many words, but passing over one could look like visiting it, or like ending
  at another hub.
- **Hub clearance** is measured to every blocked cell (walls, windows,
  outside), with a safety margin of one extra cell.
- **Each polygon is its own room**, as the deck says. That includes the
  living-room parts that ResPlan's own graph merges.
- **Every plan is attempted**, including plans that look as if they break the
  organisers' benchmark filters (a room under 2 m², or nodes not all in one
  connected free area). Our grid is stricter than plain polygon geometry, and a
  skipped plan scores zero. The filters are only used to explain a failure
  (status `excluded`). Example: in plan 2814 the kitchen is cut off by a
  window-labelled opening, but it still gets a valid design with its own hub.

---

## Known limitations and next steps

1. **A few crossings remain.** Some are forced by an order outside the 3 kept,
   some by the layout itself. Keeping more orders, or choosing the order by
   routed J from the start, would cut more, at the cost of time.
2. **Bends at nodes and the hub** are priced during routing, but not when
   orders and hub spots are first ranked (by distance only).
3. **The zoning is chosen by distance cost**, before routing. Among tied
   zonings, a different one might route to a lower J.
4. **Up to 50 tied zonings** are compared; plans with more ties are cut off at
   50.
5. **Bends in one-node rings.** A hub chosen by distance can sit diagonally
   from its node, so its out-and-back ring turns more than an in-line one
   would. Small (about 1 point of J per such ring) and left as is.

## Open questions for the organisers

- Teams place the nodes. May the submission carry them in an extra `nodes`
  list (`node_id`, `room_id`, `x`, `y`), which slide 8 doesn't have? Is any
  placement accepted (we use each room's deepest point), or is there a rule?
- Does a ring passing over another node's point (not visiting it) count as
  invalid?
- Are windows between two indoor rooms (likely mislabelled doors) still
  windows for the checker? We assume yes.

---

## Results on the test split

Last full run, 2026-10-16, all 1,632 test plans (`solve_file.py --all --split
test --jobs 6`, 45 minutes with the baselines), nodes snapped to the grid:

| | Plans |
|---|---|
| Solved under the deck's rules, and every hard rule passes our checker | **1,582** |
| Solved but failing a rule | 0 |
| A room over 100 m²: infeasible under the deck, solved under the extended rules (room split, flagged) | 42 |
| Infeasible: rooms outside the building outline (3 plans, plus 2 of the over-100 m² plans) | 5 |
| Outside the benchmark: a room under 2 m², or nodes not in one connected free area | 3 |
| Failed for any other reason | 0 |

Under the deck's rules alone that is 1,582 valid, 47 infeasible and 3 outside the
benchmark, exactly as before; every solved plan is valid.

**Hubs** (H, which decides ranking first):

| H | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|---|
| plans | 884 | 347 | 219 | 84 | 30 | 15 | 3 |

1,213 plans (77%) reach the simple lower bound `max(⌈area/100⌉, ⌈nodes/5⌉)`.
The rest need more hubs because of the zone rule: in hub-shaped homes every
bedroom opens only onto the living room. The zoning search is exact, so these
are true minimums under the rules, not missed savings.

**Cost J**, averaged over the 1,582 valid plans under the deck's rules:

| | J | L (m) | X | O (m) | B |
|---|---|---|---|---|---|
| each leg routed alone (naive) | 49.6 | | | | |
| greedy baseline | 53.8 | | | | |
| Clarke–Wright baseline | 50.0 | | | | |
| ours, previous commit | 43.9 | 32.5 | 0.05 | 0.21 | 22.0 |
| **ours, nodes on cell centres** | **41.5** | 32.4 | 0.05 | 0.21 | 17.3 |

Median J is 42.4; 1,504 plans have no crossing. Ours ranks first or ties on
1,571 of the 1,582 plans. A baseline wins the other 11, 7 of them by less than
0.3 of J; the largest gaps are plans 3147 and 3149 (Clarke–Wright, 2.1 and 1.9),
15306 (naive, 1.8) and 16541 (greedy, 1.1). In those, our routing of all rings together (a
local search) ends worse than routing each leg alone, or a different zoning
routes better. Keeping the best of ours and the baselines would close all 11.
