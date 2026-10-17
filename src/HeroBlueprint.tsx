import { useState } from "react";
import { Pause, Play } from "lucide-react";
import "./HeroBlueprint.css";

const ROUTE_A = "M 112 166 H 282 V 225 H 390 V 158 H 555 V 305 H 480 V 365 H 310 V 314 H 172 V 258 H 112 Z";
const ROUTE_B = "M 174 390 H 275 V 332 H 402 V 398 H 548 V 338 H 612 V 452 H 506 V 482 H 350 V 435 H 174 Z";

const NODES: [number, number, "coral" | "blue"][] = [
  [282, 166, "coral"], [390, 225, "coral"], [555, 305, "coral"],
  [310, 314, "coral"], [275, 390, "blue"], [402, 398, "blue"],
  [548, 338, "blue"], [506, 482, "blue"],
];

export default function HeroBlueprint() {
  const [paused, setPaused] = useState(false);

  return (
    <div className={`hero-blueprint${paused ? " hero-blueprint-paused" : ""}`}>
      <div className="hero-blueprint-top">
        <span className="hero-blueprint-eyebrow"><i /> ROUTING FIELD</span>
        <span>CONCEPT / 001</span>
      </div>
      <div className="hero-blueprint-stage" role="img" aria-label="Conceptual floor-plan grid with two continuously pulsing closed cable rings connecting hubs and nodes">
        <div className="hero-blueprint-aura" />
        <svg viewBox="0 0 700 540" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
          <defs>
            <pattern id="hero-blueprint-grid" width="34" height="34" patternUnits="userSpaceOnUse">
              <path d="M 34 0 H 0 V 34" fill="none" stroke="#78998c" strokeWidth="0.7" opacity="0.24" />
            </pattern>
            <linearGradient id="hero-blueprint-surface" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#18372f" />
              <stop offset="1" stopColor="#10271f" />
            </linearGradient>
          </defs>

          <rect x="31" y="36" width="638" height="468" rx="5" fill="#061c17" opacity=".55" />
          <rect x="22" y="26" width="638" height="468" rx="5" fill="url(#hero-blueprint-surface)" stroke="#496f5f" strokeWidth="1" />
          <rect x="22" y="26" width="638" height="468" rx="5" fill="url(#hero-blueprint-grid)" />

          <g className="hero-blueprint-zones">
            <path d="M64 76 H244 V202 H64 Z" fill="#6b9e78" />
            <path d="M264 76 H424 V184 H264 Z" fill="#65869b" />
            <path d="M444 76 H618 V276 H444 Z" fill="#9d775c" />
            <path d="M64 222 H272 V342 H64 Z" fill="#8b8d68" />
            <path d="M294 204 H424 V354 H294 Z" fill="#6f948a" />
            <path d="M64 362 H328 V456 H64 Z" fill="#728b9b" />
            <path d="M348 374 H618 V456 H348 Z" fill="#668874" />
          </g>
          <g className="hero-blueprint-room-edges" fill="none" stroke="#71998a" strokeWidth="1.3">
            <path d="M64 76 H244 V202 H64 Z M264 76 H424 V184 H264 Z M444 76 H618 V276 H444 Z" />
            <path d="M64 222 H272 V342 H64 Z M294 204 H424 V354 H294 Z M64 362 H328 V456 H64 Z M348 374 H618 V456 H348 Z" />
          </g>

          <g className="hero-blueprint-circuit hero-blueprint-circuit-coral">
            <path className="hero-blueprint-cable-shadow" d={ROUTE_A} />
            <path className="hero-blueprint-cable-body" d={ROUTE_A} />
            <path className="hero-blueprint-cable-highlight" d={ROUTE_A} />
            <path className="hero-blueprint-signal" d={ROUTE_A} pathLength="100" />
          </g>
          <g className="hero-blueprint-circuit hero-blueprint-circuit-blue">
            <path className="hero-blueprint-cable-shadow" d={ROUTE_B} />
            <path className="hero-blueprint-cable-body" d={ROUTE_B} />
            <path className="hero-blueprint-cable-highlight" d={ROUTE_B} />
            <path className="hero-blueprint-signal" d={ROUTE_B} pathLength="100" />
          </g>

          {NODES.map(([x, y, color], i) => (
            <g key={i} className={`hero-blueprint-node hero-blueprint-node-${color}`}>
              <circle cx={x} cy={y} r="10" fill="#102b23" stroke="currentColor" strokeWidth="1.4" />
              <circle cx={x} cy={y} r="3.4" fill="currentColor" />
            </g>
          ))}
          <g className="hero-blueprint-hub hero-blueprint-hub-coral" transform="translate(112 166)">
            <circle r="19" fill="#142b24" stroke="currentColor" strokeWidth="1.4" />
            <circle r="11" fill="currentColor" opacity=".18" />
            <circle r="5" fill="currentColor" />
          </g>
          <g className="hero-blueprint-hub hero-blueprint-hub-blue" transform="translate(174 390)">
            <circle r="19" fill="#142b24" stroke="currentColor" strokeWidth="1.4" />
            <circle r="11" fill="currentColor" opacity=".18" />
            <circle r="5" fill="currentColor" />
          </g>
        </svg>
      </div>
      <div className="hero-blueprint-bottom">
        <div className="hero-blueprint-legend"><span><i className="hero-blueprint-key-coral" /> Ring A</span><span><i className="hero-blueprint-key-blue" /> Ring B</span><span className="hero-blueprint-live"><i /> Signals live</span></div>
        <button type="button" onClick={() => setPaused((value) => !value)} aria-label={paused ? "Resume cable animation" : "Pause cable animation"}>
          {paused ? <Play size={13} fill="currentColor" /> : <Pause size={13} fill="currentColor" />}
          <span>{paused ? "Resume" : "Pause"}</span>
        </button>
      </div>
    </div>
  );
}
