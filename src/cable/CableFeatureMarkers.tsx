import { useEffect, useMemo } from "react";
import { Line } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";

import { toScene } from "./cablePlan";
import type { CablePlan, XY } from "./cablePlan";
import type { CableFeatureKind, HubFeatures } from "./cableFeatures";

type FeatureMap = Record<string, HubFeatures>;

const COLORS: Record<CableFeatureKind, string> = {
    bends: "#ed514a",
    crossings: "#f36f5e",
    overlaps: "#f29a68",
};

function BendCable({ plan, span, y, opacity, emphasized, onClick, onPointerOver, onPointerOut }: {
    plan: CablePlan;
    span: XY[];
    y: number;
    opacity: number;
    emphasized: boolean;
    onClick: (event: ThreeEvent<MouseEvent>) => void;
    onPointerOver: () => void;
    onPointerOut: () => void;
}) {
    const geometry = useMemo(() => {
        const path = new THREE.CurvePath<THREE.Vector3>();
        const points = span.map((point) => {
            const [x, z] = toScene(plan, point);
            return new THREE.Vector3(x, y, z);
        });
        for (let index = 1; index < points.length; index++) {
            path.add(new THREE.LineCurve3(points[index - 1], points[index]));
        }
        return new THREE.TubeGeometry(path, 14, emphasized ? 0.046 : 0.041, 8, false);
    }, [plan, span, y, emphasized]);
    useEffect(() => () => geometry.dispose(), [geometry]);
    return <mesh geometry={geometry} onClick={onClick} onPointerOver={onPointerOver} onPointerOut={onPointerOut}>
        <meshStandardMaterial color={COLORS.bends} emissive={COLORS.bends} emissiveIntensity={emphasized ? 0.35 : 0.12}
            transparent opacity={opacity} depthWrite={opacity === 1} />
    </mesh>;
}

function spanMidpoint(span: XY[]): XY {
    const total = span.slice(1).reduce((length, point, index) =>
        length + Math.hypot(point[0] - span[index][0], point[1] - span[index][1]), 0);
    let remaining = total / 2;
    for (let index = 1; index < span.length; index++) {
        const a = span[index - 1];
        const b = span[index];
        const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (remaining <= length || index === span.length - 1) {
            const t = length ? remaining / length : 0;
            return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
        }
        remaining -= length;
    }
    return span[0] ?? [0, 0];
}

export default function CableFeatureMarkers({ plan, features, heights, focus, highlight, showProblems, onSelect }: {
    plan: CablePlan;
    features: FeatureMap;
    heights: Record<string, number>;
    focus: string | null;
    highlight: CableFeatureKind | null;
    showProblems: boolean;
    onSelect: (hubId: string, kind: CableFeatureKind) => void;
}) {
    const opacityFor = (hubId: string, kind: CableFeatureKind) =>
        focus && focus !== hubId ? 0.12 : highlight && highlight !== kind ? 0.18 : highlight ? 1 : 0.68;
    const activate = (hubId: string, kind: CableFeatureKind) => (event: ThreeEvent<MouseEvent>) => {
        event.stopPropagation();
        onSelect(hubId, kind);
    };
    const hover = () => { document.body.style.cursor = "pointer"; };
    const unhover = () => { document.body.style.cursor = ""; };

    return <group>
        {plan.hubs.map((hub) => {
            const points = features[hub.hub_id];
            if (!points) return null;
            const y = (heights[hub.hub_id] ?? 0.08) + 0.11;
            const markerY = (point: XY) => Math.hypot(point[0] - hub.x, point[1] - hub.y) < 0.24 ? Math.max(y, 0.62) : y;
            const bendOpacity = opacityFor(hub.hub_id, "bends");
            const crossingOpacity = opacityFor(hub.hub_id, "crossings");
            const overlapOpacity = opacityFor(hub.hub_id, "overlaps");
            return <group key={hub.hub_id}>
                {points.bendSpans.map((span, index) => <BendCable key={`b${index}`} plan={plan} span={span}
                    y={heights[hub.hub_id] ?? 0.08} opacity={bendOpacity}
                    emphasized={highlight === "bends" && (!focus || focus === hub.hub_id)}
                    onClick={activate(hub.hub_id, "bends")} onPointerOver={hover} onPointerOut={unhover} />)}
                {showProblems && points.crossings.map((point, index) => {
                    const [x, z] = toScene(plan, point);
                    return <mesh key={`x${index}`} position={[x, markerY(point) + 0.02, z]} scale={highlight === "crossings" && (!focus || focus === hub.hub_id) ? 1.4 : 1}
                        onClick={activate(hub.hub_id, "crossings")} onPointerOver={hover} onPointerOut={unhover}>
                        <icosahedronGeometry args={[0.13, 0]} />
                        <meshStandardMaterial color={COLORS.crossings} emissive={COLORS.crossings} emissiveIntensity={0.3}
                            transparent opacity={crossingOpacity} depthWrite={crossingOpacity === 1} />
                    </mesh>;
                })}
                {showProblems && points.overlaps.map((span, index) => {
                    const point = spanMidpoint(span);
                    const [x, z] = toScene(plan, point);
                    const emphasized = highlight === "overlaps" && (!focus || focus === hub.hub_id);
                    return <group key={`o${index}`}>
                        {emphasized && <Line points={span.map((point) => {
                            const [px, pz] = toScene(plan, point);
                            return [px, y - 0.05, pz] as [number, number, number];
                        })} color={COLORS.overlaps} lineWidth={5} raycast={() => null} />}
                        <mesh position={[x, markerY(point) + 0.025, z]} rotation={[0, Math.PI / 4, 0]} scale={emphasized ? 1.35 : 1}
                            onClick={activate(hub.hub_id, "overlaps")} onPointerOver={hover} onPointerOut={unhover}>
                            <boxGeometry args={[0.14, 0.09, 0.14]} />
                            <meshStandardMaterial color={COLORS.overlaps} emissive={COLORS.overlaps} emissiveIntensity={0.25}
                                transparent opacity={overlapOpacity} depthWrite={overlapOpacity === 1} />
                        </mesh>
                    </group>;
                })}
            </group>;
        })}
    </group>;
}
