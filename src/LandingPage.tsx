import { useEffect, useRef, useState } from "react";
import { ArrowRight, CircleDot, MoveUpRight, Pause, Play } from "lucide-react";
import HeroBlueprint from "./HeroBlueprint";
import LandingStory from "./LandingStory";
import "./LandingPage.css";

type Props = { onOpenEditor: () => void };

const planVideo = `${import.meta.env.BASE_URL}landing/plan-494-3d-build.mp4`;
const planPoster = `${import.meta.env.BASE_URL}landing/plan-494-3d-poster.jpg`;
const floorplanImage = `${import.meta.env.BASE_URL}landing/floorplan-builder.webp`;
const routedPlanImage = `${import.meta.env.BASE_URL}landing/plan-14399-2d.webp`;

function PlanBuildPreview() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncMotion = () => {
      if (motionPreference.matches) {
        video.pause();
        setPlaying(false);
      } else {
        video.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
      }
    };
    syncMotion();
    motionPreference.addEventListener("change", syncMotion);
    return () => motionPreference.removeEventListener("change", syncMotion);
  }, []);

  const togglePlayback = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    else {
      video.pause();
      setPlaying(false);
    }
  };

  return <div className="landing-preview-slot landing-preview-slot-3d">
    <video ref={videoRef} className="landing-preview-video" muted loop playsInline preload="metadata"
      poster={planPoster} aria-label="Plan 494 walls and cable rings forming in 3D">
      <source src={planVideo} type="video/mp4" />
    </video>
    <span className="landing-preview-video-label">PLAN 494 / 3D BUILD</span>
    <span className="landing-slot-index">02 / SPATIAL VIEW</span>
    <button type="button" className="landing-preview-video-control" onClick={togglePlayback}
      aria-label={playing ? "Pause 3D plan animation" : "Play 3D plan animation"}>
      {playing ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}
    </button>
  </div>;
}

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
              <a href="#route-comparison" className="landing-button-text">Compare cable routes <span>↗</span></a>
            </div>
            <div className="landing-proof"><CircleDot size={17} /><span>Routes shaped by rooms, walls, and constraints.</span></div>
          </div>

          <HeroBlueprint />
        </section>

        <section className="landing-preview" id="plan-preview" aria-label="2D and 3D plan previews">
            <div className="landing-preview-top">
              <div className="landing-preview-title"><span className="landing-preview-status" /> <span>PLAN VIEWS</span><span className="landing-preview-separator">/</span><span>2D + 3D</span></div>
              <span className="landing-preview-caption">TWO ROUTED PLAN EXAMPLES</span>
            </div>
            <div className="landing-preview-stage">
              <div className="landing-preview-slot landing-preview-slot-2d">
                <img className="landing-preview-image" src={routedPlanImage}
                  alt="Plan 14399 in the 2D editor, with two hubs and their cable routes"
                  loading="lazy" decoding="async" />
                <span className="landing-preview-image-label">PLAN 14399 / 2D ROUTE</span>
                <span className="landing-slot-index">01 / TOP VIEW</span>
              </div>
              <PlanBuildPreview />
            </div>
            <div className="landing-preview-bottom">
              <span><span className="landing-bottom-dot landing-bottom-dot-2d" /> Plan the route</span>
              <span><span className="landing-bottom-dot landing-bottom-dot-3d" /> See it in space</span>
              <span className="landing-preview-ready">2D ROUTE / 3D BUILD</span>
            </div>
        </section>
        <div className="landing-footnote"><span>01 / PLAN</span><span>02 / ROUTE</span><span>03 / VALIDATE</span><span className="landing-footnote-end">From a floorplan to a routed network.</span></div>

        <section className="landing-create" id="build-floorplan" aria-labelledby="landing-create-title">
          <div className="landing-create-copy">
            <p className="landing-create-kicker">MAKE IT YOURS</p>
            <h2 id="landing-create-title">Build your own floorplan</h2>
            <p>Draw rooms, add doors and windows, then route cables through the layout you made.</p>
            <button type="button" onClick={onOpenEditor}>Start drawing <ArrowRight size={17} /></button>
          </div>
          <figure className="landing-create-figure">
            <img src={floorplanImage} alt="A custom floorplan in the GridMind editor with rooms, doors, three hubs and their cable routes"
              loading="lazy" decoding="async" />
            <figcaption>CUSTOM DRAWN PLAN / GRIDMIND EDITOR</figcaption>
          </figure>
        </section>

        <LandingStory onOpenEditor={onOpenEditor} />
      </main>
    </div>
  );
}
