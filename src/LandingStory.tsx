import { useEffect, useState } from "react";
import { ArrowRight, BadgeCheck, ChevronDown, Route, ScanLine } from "lucide-react";
import { isCablePlan } from "./cable/cablePlan";
import type { CableHub, CableMetrics, CablePlan, CableShape, RoomKind, XY } from "./cable/cablePlan";
import "./LandingStory.css";

const SAMPLE_URL = `${import.meta.env.BASE_URL}cable-plans/494.json`;
const HUB_COLORS = ["#d1495b", "#2e86ab", "#e8a33d", "#6a4c93"];

type Solution = "ours" | "naive" | "greedy";

const SOLUTION_NAMES: Record<Solution, string> = {
  ours: "GridMind",
  naive: "Separate legs",
  greedy: "Greedy search",
};

const ROOM_COLORS: Record<RoomKind, string> = {
  living: "#c8dec5",
  bedroom: "#e6d9bd",
  kitchen: "#e9bb9e",
  bathroom: "#c4d9dc",
  balcony: "#d3dfbd",
  storage: "#d9d2c7",
  stair: "#d2cde0",
};

const ROOM_KEY: { kind: RoomKind; label: string }[] = [
  { kind: "living", label: "Living" },
  { kind: "bedroom", label: "Bedroom" },
  { kind: "kitchen", label: "Kitchen" },
  { kind: "bathroom", label: "Bath" },
  { kind: "balcony", label: "Balcony" },
];

function position(plan: CablePlan, [x, y]: XY): XY {
  return [x - plan.bounds.min_x, plan.bounds.max_y - y];
}

function shapePath(plan: CablePlan, shape: CableShape): string {
  return [shape.outer, ...shape.holes]
    .map((ring) => `M ${ring.map((p) => position(plan, p).join(" ")).join(" L ")} Z`)
    .join(" ");
}

function RouteDiagram({ plan, hubs, crossings, solution }: {
  plan: CablePlan;
  hubs: CableHub[];
  crossings: XY[];
  solution: Solution;
}) {
  const width = plan.bounds.max_x - plan.bounds.min_x;
  const height = plan.bounds.max_y - plan.bounds.min_y;

  return (
    <svg
      className="landing-route-diagram"
      viewBox={`-0.6 -0.6 ${width + 1.2} ${height + 1.2}`}
      role="img"
      aria-label={`${SOLUTION_NAMES[solution]} cable routes on sample floor plan 494, with ${crossings.length} crossings. Room colors identify area types; no labels appear in the plan.`}
    >
      <g fill="#fafaf5" stroke="#b8c7b8" strokeWidth="0.07">
        {plan.outline?.map((shape, i) => <path key={i} d={shapePath(plan, shape)} fillRule="evenodd" />)}
      </g>
      <g stroke="#fffdf6" strokeWidth="0.085" strokeLinejoin="round">
        {plan.rooms.map((room, i) => <path key={i} d={shapePath(plan, room.shape)} fill={ROOM_COLORS[room.kind]} fillRule="evenodd" />)}
      </g>
      <g fill="#52695b">
        {plan.walls.map((wall, i) => <path key={i} d={shapePath(plan, wall)} fillRule="evenodd" />)}
      </g>
      <g fill="#f7f7f0">
        {[...plan.doors, ...plan.front_doors].map((door, i) => <path key={i} d={shapePath(plan, door)} fillRule="evenodd" />)}
      </g>
      <g fill="#8cb8c5">
        {plan.windows.map((window, i) => <path key={i} d={shapePath(plan, window)} fillRule="evenodd" />)}
      </g>
      <g key={solution}>
        {hubs.map((hub, i) => (
          <polyline
            key={hub.hub_id}
            className="landing-route-line"
            points={hub.ring.map((p) => position(plan, p).join(",")).join(" ")}
            fill="none"
            stroke={HUB_COLORS[i % HUB_COLORS.length]}
            strokeWidth="0.11"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </g>
      {plan.nodes.map((node) => {
        const [x, y] = position(plan, [node.x, node.y]);
        return <g key={node.node_id}><circle cx={x} cy={y} r="0.15" fill="#fff" stroke="#294235" strokeWidth="0.065" /><circle cx={x} cy={y} r="0.045" fill="#294235" /></g>;
      })}
      {hubs.map((hub, i) => {
        const [x, y] = position(plan, [hub.x, hub.y]);
        return <g key={hub.hub_id}><circle cx={x} cy={y} r="0.3" fill="#fffdf6" stroke={HUB_COLORS[i % HUB_COLORS.length]} strokeWidth="0.075" /><circle cx={x} cy={y} r="0.17" fill={HUB_COLORS[i % HUB_COLORS.length]} /></g>;
      })}
      {crossings.map((p, i) => {
        const [x, y] = position(plan, p);
        return <circle key={i} cx={x} cy={y} r="0.2" fill="none" stroke="#b3422e" strokeWidth="0.085" />;
      })}
    </svg>
  );
}

function metric(value: number | undefined, digits = 0) {
  return value === undefined ? "—" : value.toFixed(digits);
}

const METRICS: { key: keyof CableMetrics; label: string; digits: number }[] = [
  { key: "H", label: "Hubs", digits: 0 },
  { key: "L", label: "Cable length", digits: 1 },
  { key: "X", label: "Crossings", digits: 0 },
  { key: "O", label: "Overlap", digits: 1 },
  { key: "B", label: "Bends", digits: 0 },
];

export default function LandingStory({ onOpenEditor }: { onOpenEditor: () => void }) {
  const [plan, setPlan] = useState<CablePlan | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [solution, setSolution] = useState<Solution>("ours");

  useEffect(() => {
    const controller = new AbortController();
    fetch(SAMPLE_URL, { signal: controller.signal })
      .then((response) => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); })
      .then((data: unknown) => { if (!isCablePlan(data)) throw new Error("Invalid sample plan"); setPlan(data); })
      .catch((error: unknown) => { if (!(error instanceof DOMException && error.name === "AbortError")) setLoadError(true); });
    return () => controller.abort();
  }, []);

  const naive = plan?.alternatives?.naive;
  const greedy = plan?.alternatives?.greedy;
  const alternative = solution === "ours" ? null : plan?.alternatives?.[solution];
  const selected = alternative?.valid ? alternative : null;
  const hubs = selected?.hubs ?? plan?.hubs ?? [];
  const metrics = selected?.metrics ?? plan?.metrics;
  const crossings = selected?.problems?.crossings ?? (selected ? [] : plan?.problems?.crossings ?? []);
  const costDifference = selected?.metrics.J !== undefined && plan?.metrics.J !== undefined
    ? selected.metrics.J - plan.metrics.J
    : null;
  const naiveDifference = naive?.metrics.J !== undefined && plan?.metrics.J !== undefined
    ? naive.metrics.J - plan.metrics.J : null;
  const greedyDifference = greedy?.metrics.J !== undefined && plan?.metrics.J !== undefined
    ? greedy.metrics.J - plan.metrics.J : null;

  return (
    <>
      <section className="landing-comparison" id="route-comparison" aria-labelledby="comparison-title">
        <div className="landing-section-heading">
          <div>
            <p className="landing-section-kicker">01 / ROUTE COMPARISON</p>
            <h2 id="comparison-title">Same plan. <em>Smarter route.</em></h2>
          </div>
          <p>Three ways through the same floor plan. Compare the cable path, its crossings, and the cost of each approach.</p>
        </div>

        <div className="landing-comparison-surface">
          <div className="landing-comparison-map">
            <div className="landing-comparison-toolbar">
              <span className="landing-comparison-plan-id"><span className="landing-live-dot" /> SAMPLE PLAN 494</span>
              <div className="landing-solution-switch" role="group" aria-label="Choose routing solution">
                <button type="button" aria-pressed={solution === "ours"} onClick={() => setSolution("ours")}>GridMind</button>
                <button type="button" aria-pressed={solution === "naive"} disabled={!naive?.valid} onClick={() => setSolution("naive")}>Separate legs</button>
                <button type="button" aria-pressed={solution === "greedy"} disabled={!greedy?.valid} onClick={() => setSolution("greedy")}>Greedy search</button>
              </div>
            </div>
            <div className="landing-comparison-canvas">
              {plan ? <RouteDiagram plan={plan} hubs={hubs} crossings={crossings} solution={solution} /> : (
                <p className="landing-route-status" role="status">{loadError ? "Sample plan is unavailable. Open the editor to explore a plan." : "Loading sample plan…"}</p>
              )}
            </div>
            <div className="landing-room-key" aria-label="Plan area colors">
              {ROOM_KEY.map(({ kind, label }) => <span key={kind}><i style={{ backgroundColor: ROOM_COLORS[kind] }} />{label}</span>)}
            </div>
            <div className="landing-comparison-map-footer"><span><i className="landing-legend-hub" /> Hub</span><span><i className="landing-legend-node" /> Node</span><span><i className="landing-legend-crossing" /> Crossing</span><span className="landing-plan-caption">2D ROUTE / PLAN 494</span></div>
          </div>

          <div className="landing-comparison-data">
            <div className="landing-data-head"><span>ROUTE ANALYSIS</span><span>{SOLUTION_NAMES[solution].toUpperCase()}</span></div>
            <div className="landing-cost"><span>Routing cost · J</span><strong>{metric(metrics?.J, 1)}</strong><small>J = length + 5 × crossings + overlap + 0.5 × bends</small></div>
            <div className="landing-metrics-grid">
              {METRICS.map(({ key, label, digits }) => <div key={key}><strong>{metric(metrics?.[key], digits)}</strong><span>{label}</span></div>)}
            </div>
            <div className="landing-difference" aria-live="polite">
              {selected && costDifference !== null ? (
                <>This {SOLUTION_NAMES[solution].toLowerCase()} route costs <strong>{costDifference.toFixed(1)} more J</strong> than GridMind on the same plan.</>
              ) : naiveDifference !== null && greedyDifference !== null ? (
                <>GridMind scores <strong>{naiveDifference.toFixed(1)} less J</strong> than separate legs and <strong>{greedyDifference.toFixed(1)} less J</strong> than greedy search on this plan.</>
              ) : "Select a route to inspect its cost."}
            </div>
          </div>
        </div>
      </section>

      <section className="landing-process" aria-labelledby="process-title">
        <div className="landing-section-heading landing-process-heading">
          <div><p className="landing-section-kicker">02 / HOW IT WORKS</p><h2 id="process-title">From plan to <em>proof.</em></h2></div>
          <p>Every line on the plan has a reason behind it, from the rooms it serves to the rules it passes.</p>
        </div>
        <div className="landing-process-steps">
          <article><span className="landing-step-mark"><ScanLine size={22} /></span><span className="landing-step-number">01 / PLAN</span><h3>Start with the floor plan.</h3><p>Draw a plan or import one. Rooms, doors, walls, and node positions define where cable can go.</p></article>
          <article><span className="landing-step-mark"><Route size={22} /></span><span className="landing-step-number">02 / ROUTE</span><h3>Build closed rings.</h3><p>GridMind places hubs, assigns rooms, orders the nodes, and routes cable through the available space.</p></article>
          <article><span className="landing-step-mark"><BadgeCheck size={22} /></span><span className="landing-step-number">03 / VALIDATE</span><h3>Check every decision.</h3><p>Inspect capacity, coverage, cable length, crossings, overlap, and bends in one place.</p></article>
        </div>
        <details className="landing-why">
          <summary><span>Why this route?</span><span>See a reason from sample plan 494 <ChevronDown size={17} /></span></summary>
          <div>{plan?.explain?.summary?.[0] ?? "A route is explained through its hubs, room coverage, and rule checks. Load the sample to see its exact reason."}</div>
        </details>
      </section>

      <section className="landing-final-cta" aria-labelledby="final-cta-title">
        <div className="landing-final-grid" aria-hidden="true" />
        <div><p className="landing-section-kicker">START ROUTING</p><h2 id="final-cta-title">A clear path starts<br />with your plan.</h2></div>
        <button type="button" onClick={onOpenEditor}>Open the editor <ArrowRight size={19} /></button>
      </section>
    </>
  );
}
