import { ArrowRight, Box, CircleDot, MoveUpRight, Square } from "lucide-react";
import "./LandingPage.css";

type Props = { onOpenEditor: () => void };

export default function LandingPage({ onOpenEditor }: Props) {
  return (
    <div className="landing-page">
      <div className="landing-grid" aria-hidden="true" />
      <svg className="landing-cables" viewBox="0 0 1440 850" preserveAspectRatio="xMidYMin slice" aria-hidden="true">
        <path className="landing-wire landing-wire-a" d="M -30 164 H 230 V 92 H 510 V 176 H 692 V 120 H 980 V 50 H 1470" />
        <path className="landing-wire landing-wire-b" d="M -30 710 H 145 V 625 H 368 V 735 H 570 V 680 H 735" />
        <path className="landing-wire-pulse landing-wire-pulse-a" pathLength="100" d="M -30 164 H 230 V 92 H 510 V 176 H 692 V 120 H 980 V 50 H 1470" />
        <path className="landing-wire-pulse landing-wire-pulse-b" pathLength="100" d="M -30 710 H 145 V 625 H 368 V 735 H 570 V 680 H 735" />
        <circle cx="230" cy="164" r="6" fill="#d1495b" /><circle cx="510" cy="176" r="5" fill="#d1495b" />
        <circle cx="368" cy="735" r="6" fill="#2e86ab" /><circle cx="570" cy="680" r="5" fill="#2e86ab" />
      </svg>

      <header className="landing-nav">
        <a className="landing-brand" href="/" aria-label="GridMind home"><img src={`${import.meta.env.BASE_URL}gridmind-icon.png`} alt="" className="landing-brand-image" /> GridMind<span className="landing-brand-dot">.</span></a>
        <span className="landing-nav-note">Cable routing, made visible</span>
        <button className="landing-nav-link" onClick={onOpenEditor}>Open editor <MoveUpRight size={16} /></button>
      </header>

      <main>
        <section className="landing-hero">
          <div className="landing-intro">
            <p className="landing-kicker"><span className="landing-kicker-line" /> PLANNING WITH A CLEAR PATH</p>
            <h1>Every cable<br />has a <em>reason.</em></h1>
            <p className="landing-lede">Turn a floor plan into a network of hubs, nodes, and closed cable rings. See the route, check the rules, and understand the cost.</p>
            <div className="landing-actions">
              <button className="landing-button-primary" onClick={onOpenEditor}>Open the editor <ArrowRight size={18} /></button>
              <a href="#plan-preview" className="landing-button-text">See the plan views <span>↗</span></a>
            </div>
            <div className="landing-proof"><CircleDot size={17} /><span>Routes shaped by rooms, walls, and constraints.</span></div>
          </div>

          <div className="landing-preview" id="plan-preview" aria-label="2D and 3D plan preview spaces">
            <div className="landing-preview-top">
              <div className="landing-preview-title"><span className="landing-preview-status" /> <span>PLAN VIEWS</span><span className="landing-preview-separator">/</span><span>2D + 3D</span></div>
              <span className="landing-preview-caption">ONE ROUTE · TWO PERSPECTIVES</span>
            </div>
            <div className="landing-preview-stage">
              {/* Replace each slot with the finished 2D or 3D plan visual. */}
              <div className="landing-preview-slot landing-preview-slot-2d">
                <div className="landing-slot-icon"><Square size={31} strokeWidth={1.25} /></div>
                <strong>2D floor plan</strong>
                <span>Plan preview</span>
                <span className="landing-slot-index">01 / TOP VIEW</span>
              </div>
              <div className="landing-preview-slot landing-preview-slot-3d">
                <div className="landing-slot-icon"><Box size={34} strokeWidth={1.2} /></div>
                <strong>3D cable plan</strong>
                <span>Scene preview</span>
                <span className="landing-slot-index">02 / SPATIAL VIEW</span>
              </div>
            </div>
            <div className="landing-preview-bottom">
              <span><span className="landing-bottom-dot landing-bottom-dot-2d" /> Plan the route</span>
              <span><span className="landing-bottom-dot landing-bottom-dot-3d" /> See it in space</span>
              <span className="landing-preview-ready">TWO VIEWS / ONE PLAN</span>
            </div>
          </div>
        </section>
        <div className="landing-footnote"><span>01 / PLAN</span><span>02 / ROUTE</span><span>03 / VALIDATE</span><span className="landing-footnote-end">One plan. Two ways to see the network.</span></div>
      </main>
    </div>
  );
}
