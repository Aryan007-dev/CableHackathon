import { useEffect, useMemo } from "react";
import * as THREE from "three";

type GridBounds = { minX: number; maxX: number; minZ: number; maxZ: number };
const BASE_BOUNDS: GridBounds = { minX: -50, maxX: 50, minZ: -50, maxZ: 50 };
const noRaycast = () => null;

function makeGrid(bounds: GridBounds, spacing: number, y: number) {
    const points: number[] = [];
    const { minX, maxX, minZ, maxZ } = bounds;
    for (let x = Math.ceil(minX / spacing) * spacing; x <= maxX; x += spacing) {
        points.push(x, y, minZ, x, y, maxZ);
    }
    for (let z = Math.ceil(minZ / spacing) * spacing; z <= maxZ; z += spacing) {
        points.push(minX, y, z, maxX, y, z);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    return geometry;
}

function GridLines({ bounds, spacing, y, color, opacity }: {
    bounds: GridBounds; spacing: number; y: number; color: string; opacity: number;
}) {
    const geometry = useMemo(() => makeGrid(bounds, spacing, y), [bounds, spacing, y]);
    useEffect(() => () => geometry.dispose(), [geometry]);
    return <lineSegments geometry={geometry} raycast={noRaycast}>
        <lineBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} />
    </lineSegments>;
}

export default function CableStage() {
    return <group>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.2, 0]} raycast={noRaycast}>
            <planeGeometry args={[100, 100]} />
            <meshStandardMaterial color="#344a50" roughness={0.97} metalness={0.03} />
        </mesh>
        {/* Minor and major lines continue across the entire surface. */}
        <GridLines bounds={BASE_BOUNDS} spacing={0.5} y={-0.197} color="#a0b7b7" opacity={0.12} />
        <GridLines bounds={BASE_BOUNDS} spacing={2} y={-0.196} color="#b9c9c7" opacity={0.28} />
        <GridLines bounds={BASE_BOUNDS} spacing={10} y={-0.195} color="#c5d2d0" opacity={0.3} />
    </group>;
}
