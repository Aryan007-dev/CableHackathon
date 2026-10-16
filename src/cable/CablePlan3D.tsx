// An imported Cable Ring plan in 3D: room floors, walls built up from the
// plan's wall polygons, room labels on the floor, and each hub's ring as a
// coloured tube with its hub cabinet and node markers.
//
// Floors and walls ignore clicks (raycast off), so clicks fall through to the
// editor's own objects. Rings, hubs and nodes can be clicked to inspect a hub.
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Billboard, ContactShadows, Line, Text, useTexture } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";

import { useEditor } from "../store";
import { FLOOR_TEXTURES } from "../floorTextures";
import { insidePolygon } from "../2d/planGeometry";
import { moveHub } from "./cableActions";
import { themeColor } from "../themeColor";
import { formatArea, formatLength } from "../units";
import type { LengthUnit } from "../units";
import { frameKey, fromScene, hubOfNode, hubToken, ringsToDraw, roomEdges, solutionView, toScene } from "./cablePlan";
import type { CableFloor, CableHeight, CablePlan, CableRoom, CableShape, CableWallFinish, XY } from "./cablePlan";

const WALL_HEIGHT = 2.7;
const CUTAWAY_HEIGHT = 0.9; // low walls, so the cables stay in view
const DOOR_TOP = 2.1;
const WINDOW_SILL = 0.9;
// Where the cable runs; each hub's ring a little higher than the last, so
// shared runs stay visible.
const CABLE_HEIGHT: Record<CableHeight, number> = { floor: 0.08, skirting: 0.3, ceiling: 2.5 };
const CABLE_STEP = 0.04;
const CABLE_RADIUS = 0.03;
const CABINET_HEIGHT = 0.5;
const DIM = 0.15; // opacity of what isn't the inspected hub's
const SLAB = 0.15; // the floor slab's thickness, below the floor (y = 0)
const FLOOR_PATTERN_M = 2; // one texture tile per 2 m of floor
const FLOOR_TEXTURE: Record<Exclude<CableFloor, "zones">, keyof typeof FLOOR_TEXTURES> = { wood: "laminate", tiles: "concrete" };
const wallMaps = (name: string, size: "1k" | "2k" = "1k", packedRoughness = false) => ({
    map: `${import.meta.env.BASE_URL}cable-plans/textures/${name}_diff_${size}.jpg`,
    normalMap: `${import.meta.env.BASE_URL}cable-plans/textures/${name}_nor_gl_${size}.jpg`,
    roughnessMap: `${import.meta.env.BASE_URL}cable-plans/textures/${name}_${packedRoughness ? "arm" : "rough"}_${size}.jpg`,
});
const WALL_TEXTURES: Record<Exclude<CableWallFinish, "plain">, ReturnType<typeof wallMaps>> = {
    cladding: wallMaps("exterior_wall_cladding_02", "2k", true),
    beige: wallMaps("beige_wall_001"),
    concrete: wallMaps("concrete_wall_009"),
    painted: wallMaps("painted_plaster_wall"),
};
const WALL_PATTERN_M = 2;
const WALL_NORMAL_SCALE = new THREE.Vector2(0.35, 0.35);
const FLOOR_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); // y = 0, for dragging on the floor

const noRaycast = () => null;
const hubColor = (hubId: string | null) => themeColor(...hubToken(hubId));

// A plan polygon as a three.js Shape lying in the XY plane. Meshes using it are
// turned -90° about x, which maps the shape's (x, y) to the floor's (x, -z),
// so y is negated here to land each corner on its 3D [x, z].
function toShape(plan: CablePlan, s: CableShape): THREE.Shape {
    const pts = (ring: CableShape["outer"]) =>
        ring.map((p) => {
            const [x, z] = toScene(plan, p);
            return new THREE.Vector2(x, -z);
        });
    const shape = new THREE.Shape(pts(s.outer));
    shape.holes = s.holes.map((h) => new THREE.Path(pts(h)));
    return shape;
}

// Geometry made in a useMemo isn't freed by React: dispose it when replaced.
function useDispose(geometry: THREE.BufferGeometry) {
    useEffect(() => () => geometry.dispose(), [geometry]);
}

// Polygons extruded straight up from `bottom` to `top`.
function useWallMaterial(finish: Exclude<CableWallFinish, "plain">) {
    const loaded = useTexture(WALL_TEXTURES[finish]);
    const maxAnisotropy = useThree((state) => state.gl.capabilities.getMaxAnisotropy());
    const textures = useMemo(() => {
        const tile = (source: THREE.Texture, colorSpace: THREE.ColorSpace) => {
            const texture = source.clone();
            texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
            texture.repeat.set(1 / WALL_PATTERN_M, 1 / WALL_PATTERN_M);
            texture.colorSpace = colorSpace;
            texture.anisotropy = Math.min(4, maxAnisotropy);
            texture.needsUpdate = true;
            return texture;
        };
        return {
            map: tile(loaded.map, THREE.SRGBColorSpace),
            normalMap: tile(loaded.normalMap, THREE.NoColorSpace),
            // Roughness maps, including the cladding's packed ARM map, use green.
            roughnessMap: tile(loaded.roughnessMap, THREE.NoColorSpace),
        };
    }, [loaded.map, loaded.normalMap, loaded.roughnessMap, maxAnisotropy]);
    const material = useMemo(() => new THREE.MeshStandardMaterial({
        ...textures,
        normalScale: WALL_NORMAL_SCALE,
        roughness: 0.95,
        metalness: 0,
    }), [textures]);
    useEffect(() => () => {
        material.dispose();
        Object.values(textures).forEach((texture) => texture.dispose());
    }, [material, textures]);
    return material;
}

function Prisms({ plan, shapes, bottom, top, color, opacity = 1, material }: {
    plan: CablePlan; shapes: CableShape[]; bottom: number; top: number; color: string; opacity?: number; material?: THREE.Material;
}) {
    const geometry = useMemo(
        () => new THREE.ExtrudeGeometry(shapes.map((s) => toShape(plan, s)), { depth: Math.max(top - bottom, 0.001), bevelEnabled: false }),
        [plan, shapes, bottom, top]
    );
    useDispose(geometry);
    if (top <= bottom || shapes.length === 0) return null;
    return (
        <mesh geometry={geometry} material={material} rotation={[-Math.PI / 2, 0, 0]} position={[0, bottom, 0]} raycast={noRaycast}>
            {!material && <meshStandardMaterial color={color} transparent={opacity < 1} opacity={opacity} />}
        </mesh>
    );
}

function PlanWalls({ plan, doors, wallTop, wallColor, windowColor, material }: {
    plan: CablePlan; doors: CableShape[]; wallTop: number; wallColor: string; windowColor: string; material?: THREE.Material;
}) {
    return <>
        <Prisms plan={plan} shapes={plan.walls} bottom={0} top={wallTop} color={wallColor} material={material} />
        <Prisms plan={plan} shapes={doors} bottom={DOOR_TOP} top={wallTop} color={wallColor} material={material} />
        <Prisms plan={plan} shapes={plan.windows} bottom={0} top={Math.min(WINDOW_SILL, wallTop)} color={wallColor} material={material} />
        <Prisms plan={plan} shapes={plan.windows} bottom={WINDOW_SILL} top={Math.min(DOOR_TOP, wallTop)} color={windowColor} opacity={0.45} />
        <Prisms plan={plan} shapes={plan.windows} bottom={DOOR_TOP} top={wallTop} color={wallColor} material={material} />
    </>;
}

function TexturedPlanWalls({ finish, ...props }: Omit<Parameters<typeof PlanWalls>[0], "material"> & { finish: Exclude<CableWallFinish, "plain"> }) {
    const material = useWallMaterial(finish);
    return <PlanWalls {...props} material={material} />;
}

// The imported door polygon is a wall-depth rectangle. Its longest edge gives
// the opening direction; the panel hinges at one end and stays slightly ajar.
function DoorLeaves({ plan, doors, height }: { plan: CablePlan; doors: CableShape[]; height: number }) {
    const leaves = useMemo(() => doors.flatMap((door) => {
        if (door.outer.length < 4) return [];
        const corners = door.outer.map((point) => toScene(plan, point));
        let longest = 0;
        let edge = 0;
        for (let i = 0; i < corners.length; i++) {
            const a = corners[i];
            const b = corners[(i + 1) % corners.length];
            const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
            if (length > longest) { longest = length; edge = i; }
        }
        if (longest < 0.35 || longest > 2.5) return [];
        const a = corners[edge];
        const b = corners[(edge + 1) % corners.length];
        const cx = corners.reduce((sum, p) => sum + p[0], 0) / corners.length;
        const cz = corners.reduce((sum, p) => sum + p[1], 0) / corners.length;
        const ux = (b[0] - a[0]) / longest;
        const uz = (b[1] - a[1]) / longest;
        return [{ x: cx - ux * longest / 2, z: cz - uz * longest / 2, angle: -Math.atan2(uz, ux), width: longest }];
    }), [plan, doors]);
    const panelHeight = Math.min(height, DOOR_TOP - 0.06);
    return <group>
        {leaves.map((leaf, index) => (
            <group key={index} position={[leaf.x, 0, leaf.z]} rotation={[0, leaf.angle, 0]}>
                <group rotation={[0, 0.38, 0]}>
                    <mesh position={[leaf.width / 2, panelHeight / 2, 0]} raycast={noRaycast} castShadow>
                        <boxGeometry args={[leaf.width - 0.06, panelHeight, 0.055]} />
                        <meshStandardMaterial color="#91a69e" roughness={0.72} metalness={0.08} />
                    </mesh>
                    <mesh position={[leaf.width - 0.15, Math.min(0.95, panelHeight * 0.58), 0.047]} raycast={noRaycast}>
                        <sphereGeometry args={[0.035, 8, 6]} />
                        <meshStandardMaterial color="#d6ba7a" roughness={0.35} metalness={0.55} />
                    </mesh>
                </group>
            </group>
        ))}
    </group>;
}

function RoomFloor({ plan, shape, color, opacity = 1, y = 0.005 }: {
    plan: CablePlan; shape: CableShape; color: string; opacity?: number; y?: number;
}) {
    const geometry = useMemo(() => new THREE.ShapeGeometry(toShape(plan, shape)), [plan, shape]);
    useDispose(geometry);
    return (
        <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} position={[0, y, 0]} raycast={noRaycast}>
            <meshStandardMaterial color={color} transparent={opacity < 1} opacity={opacity} depthWrite={opacity === 1} />
        </mesh>
    );
}

// A room's wall lengths, flat on the floor just inside each wall: a measuring
// line with end ticks, and the length beside it, turned to read along the
// wall (never upside down).
function RoomDimensions({ plan, room, units, color }: { plan: CablePlan; room: CableRoom; units: LengthUnit; color: string }) {
    const y = 0.015;
    return (
        <>
            {roomEdges(room).map((edge, i) => {
                const [ax, az] = toScene(plan, edge.a);
                const [bx, bz] = toScene(plan, edge.b);
                // Into the room, in scene axes (the plan's y is the scene's -z).
                const [nx, nz] = [edge.inward[0], -edge.inward[1]];
                const len = Math.hypot(bx - ax, bz - az);
                const [ux, uz] = [(bx - ax) / len, (bz - az) / len];
                const inset = 0.18; // the line's distance from the wall
                const trim = 0.12; // kept clear of the corners
                const p = (t: number, off: number): [number, number, number] =>
                    [ax + ux * t + nx * off, y, az + uz * t + nz * off];
                let angle = Math.atan2(-(bz - az), bx - ax);
                if (angle > Math.PI / 2) angle -= Math.PI;
                if (angle <= -Math.PI / 2) angle += Math.PI;
                return (
                    <group key={i}>
                        <Line points={[p(trim, inset), p(len - trim, inset)]} color={color} lineWidth={1.5} raycast={noRaycast} />
                        <Line points={[p(trim, inset - 0.08), p(trim, inset + 0.08)]} color={color} lineWidth={1.5} raycast={noRaycast} />
                        <Line points={[p(len - trim, inset - 0.08), p(len - trim, inset + 0.08)]} color={color} lineWidth={1.5} raycast={noRaycast} />
                        <group position={p(len / 2, inset + 0.2)} rotation={[0, angle, 0]}>
                            <Text rotation={[-Math.PI / 2, 0, 0]} fontSize={0.17} color={color} anchorX="center" anchorY="middle"
                                outlineWidth={0.012} outlineColor="#ffffff" raycast={noRaycast}>
                                {formatLength(edge.length, units)}
                            </Text>
                        </group>
                    </group>
                );
            })}
        </>
    );
}

// Plain floor while a texture loads.
function RoomFloorFallback({ plan, shapes, color }: { plan: CablePlan; shapes: CableShape[]; color: string }) {
    const geometry = useMemo(() => new THREE.ShapeGeometry(shapes.map((s) => toShape(plan, s))), [plan, shapes]);
    useDispose(geometry);
    return (
        <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]} raycast={noRaycast}>
            <meshStandardMaterial color={color} />
        </mesh>
    );
}

// The whole floor in one finish (the editor's own floor textures). A shape's
// UVs are its corners in metres, so the repeat sets the tile size.
function TexturedFloor({ plan, shapes, finish }: { plan: CablePlan; shapes: CableShape[]; finish: Exclude<CableFloor, "zones"> }) {
    const loaded = useTexture(FLOOR_TEXTURES[FLOOR_TEXTURE[finish]]);
    // useTexture caches by URL and the editor's Floor uses the same files:
    // clone before changing the tiling (clones share the image).
    const textures = useMemo(() => {
        const tile = (t: THREE.Texture) => {
            const c = t.clone();
            c.wrapS = c.wrapT = THREE.RepeatWrapping;
            c.repeat.set(1 / FLOOR_PATTERN_M, 1 / FLOOR_PATTERN_M);
            return c;
        };
        return { map: tile(loaded.map), normalMap: tile(loaded.normalMap), roughnessMap: tile(loaded.roughnessMap) };
    }, [loaded.map, loaded.normalMap, loaded.roughnessMap]);
    useEffect(() => () => Object.values(textures).forEach((t) => t.dispose()), [textures]);
    const geometry = useMemo(() => new THREE.ShapeGeometry(shapes.map((s) => toShape(plan, s))), [plan, shapes]);
    useDispose(geometry);
    return (
        <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]} raycast={noRaycast}>
            <meshStandardMaterial {...textures} />
        </mesh>
    );
}

// Plan points -> a path of straight pieces at height y.
function pathOf(plan: CablePlan, ring: XY[], y: number) {
    const points: THREE.Vector3[] = [];
    for (const p of ring) {
        const [x, z] = toScene(plan, p);
        const last = points[points.length - 1];
        if (!last || Math.hypot(last.x - x, last.z - z) > 1e-4) points.push(new THREE.Vector3(x, y, z));
    }
    const path = new THREE.CurvePath<THREE.Vector3>();
    for (let i = 1; i < points.length; i++) path.add(new THREE.LineCurve3(points[i - 1], points[i]));
    return path;
}

// A tube along a path; enough segments that each corner stays sharp (~5 cm).
function Tube({ path, radius, color, opacity = 1, onClick }: {
    path: THREE.CurvePath<THREE.Vector3>; radius: number; color: string; opacity?: number;
    onClick?: (e: ThreeEvent<MouseEvent>) => void;
}) {
    const geometry = useMemo(() => {
        const segments = Math.max(16, Math.ceil(path.getLength() / 0.05));
        return new THREE.TubeGeometry(path, segments, radius, 8, false);
    }, [path, radius]);
    useDispose(geometry);
    if (path.curves.length === 0) return null;
    return (
        <mesh geometry={geometry} onClick={onClick} raycast={onClick ? undefined : noRaycast}>
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.25} transparent={opacity < 1} opacity={opacity} />
        </mesh>
    );
}

// Glowing beads running round a ring, hub first, at walking pace.
function Pulses({ path, color }: { path: THREE.CurvePath<THREE.Vector3>; color: string }) {
    const length = path.getLength();
    const count = Math.max(1, Math.round(length / 3));
    const beads = useRef<(THREE.Mesh | null)[]>([]);
    useFrame(({ clock }) => {
        if (length === 0) return;
        const t = (clock.getElapsedTime() * 1.2) / length; // 1.2 m/s
        beads.current.forEach((bead, i) => {
            if (bead) bead.position.copy(path.getPointAt((t + i / count) % 1));
        });
    });
    if (length === 0) return null;
    return (
        <>
            {Array.from({ length: count }, (_, i) => (
                <mesh key={i} ref={(m) => { beads.current[i] = m; }} raycast={noRaycast}>
                    <sphereGeometry args={[0.07, 12, 8]} />
                    <meshStandardMaterial color="#ffffff" emissive={color} emissiveIntensity={1.2} />
                </mesh>
            ))}
        </>
    );
}

// Point the camera at a newly imported plan, from above for top-down.
function FramePlan({ plan }: { plan: CablePlan }) {
    // Re-frame for a different plan, not for a re-solve of the same one (a
    // dragged hub returns a new object with the same extent).
    const extent = frameKey(plan);
    const latest = useRef(plan);
    useEffect(() => {
        latest.current = plan;
    });
    const camera = useThree((s) => s.camera);
    const get = useThree((s) => s.get);
    const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3; update: () => void } | null;

    useEffect(() => {
        if (!controls) return;
        const plan = latest.current;
        const { min_x, min_y, max_x, max_y } = plan.bounds;
        const width = max_x - min_x;
        const depth = max_y - min_y;
        const size = get().size; // read now: a resize alone shouldn't re-frame
        const span = Math.max(width, depth);
        const [cx, cz] = toScene(plan, [(min_x + max_x) / 2, (min_y + max_y) / 2]);
        const centre = new THREE.Vector3(cx, 0, cz);
        controls.target.copy(centre);
        if (camera instanceof THREE.OrthographicCamera) {
            camera.position.set(centre.x, 30, centre.z);
            camera.zoom = 0.85 * Math.min(size.width / width, size.height / depth);
            camera.updateProjectionMatrix();
        } else {
            camera.position.set(centre.x + span * 0.35, span * 0.95, centre.z + span * 0.85);
        }
        controls.update();
    }, [extent, camera, controls, get]);

    return null;
}

// Saves a PNG of the 3D view when the panel's export asks (store.requestScreenshot).
function Screenshot({ name }: { name: string }) {
    const request = useEditor((s) => s.screenshotRequest);
    const { gl, scene, camera } = useThree();
    const handled = useRef(request);
    useEffect(() => {
        if (request === handled.current) return;
        handled.current = request;
        // The canvas is cleared after each frame, so draw one now and read it at once.
        gl.render(scene, camera);
        const a = document.createElement("a");
        a.href = gl.domElement.toDataURL("image/png");
        a.download = `${name}-3d.png`;
        a.click();
    }, [request, gl, scene, camera, name]);
    return null;
}

export default function CablePlan3D() {
    const stored = useEditor((s) => s.doc.cablePlan);
    const layers = useEditor((s) => s.cableLayers);
    // The solution being shown (ours or a baseline), and one overlaid in grey.
    const plan = useMemo(() => stored && solutionView(stored, layers.solution), [stored, layers.solution]);
    const overlay = useMemo(
        () => (stored && layers.overlay && layers.overlay !== layers.solution ? solutionView(stored, layers.overlay) : null),
        [stored, layers.overlay, layers.solution]
    );
    const hasManualWalls = useEditor((s) =>
        Object.values(s.doc.nodes).some((node) => node.type === "wall")
    );
    const draggable = layers.solution === "ours";
    const units = useEditor((s) => s.units);
    const focus = useEditor((s) => s.cableFocus);
    const setFocus = useEditor((s) => s.setCableFocus);
    const busy = useEditor((s) => s.cableBusy);
    const controls = useThree((s) => s.controls) as unknown as { enabled: boolean } | null;
    // A hub being dragged across the floor: where it is now, scene [x, z].
    const [drag, setDrag] = useState<{ hubId: string; from: XY; at: XY } | null>(null);

    const colors = useMemo(() => ({
        wall: themeColor("--color-cable-wall-3d", "#e9e6dc"),
        room: themeColor("--color-cable-room", "#f1f0ea"),
        window: themeColor("--color-cable-window", "#9cc3d5"),
        label: themeColor("--color-cable-label", "#1f2a24"),
        ink: themeColor("--color-ink-muted", "#6b736c"),
        warning: themeColor("--color-warning", "#b5533c"),
        naive: themeColor("--color-ink-faint", "#9aa19b"),
        slab: themeColor("--color-cable-slab", "#cfccc0"),
        dimension: themeColor("--color-dimension-text", "#3e5644"),
    }), []);

    // Each ring to draw as a 3D path, at its hub's own height.
    const base = CABLE_HEIGHT[layers.height];
    const hubY = useMemo(
        () => Object.fromEntries((plan?.hubs ?? []).map((h, i) => [h.hub_id, base + i * CABLE_STEP])),
        [plan, base]
    );
    const rings = useMemo(
        // An overlay ring sits at the height of the shown hub with the same id, or the base.
        () => (plan ? ringsToDraw(plan, overlay).map((r) => ({ ...r, path: pathOf(plan, r.points, hubY[r.hub.hub_id] ?? base) })) : []),
        [plan, overlay, hubY, base]
    );
    const overlapPaths = useMemo(
        () => (plan?.problems ? plan.problems.overlaps.map((seg) => pathOf(plan, seg, base + 0.02)) : []),
        [plan, base]
    );
    // Stable between renders, so the door headers aren't rebuilt every frame.
    const doors = useMemo(() => (plan ? [...plan.doors, ...plan.front_doors] : []), [plan]);
    // The building's floor: its outline, or (older files) all its rooms.
    const floorShapes = useMemo(() => (plan ? (plan.outline?.length ? plan.outline : plan.rooms.map((r) => r.shape)) : []), [plan]);

    if (!plan) return null;

    const [stageX, stageZ] = toScene(plan, [
        (plan.bounds.min_x + plan.bounds.max_x) / 2,
        (plan.bounds.min_y + plan.bounds.max_y) / 2,
    ]);
    const stageSpan = Math.max(plan.bounds.max_x - plan.bounds.min_x, plan.bounds.max_y - plan.bounds.min_y);

    const wallTop = layers.cutaway ? CUTAWAY_HEIGHT : WALL_HEIGHT;
    const hubOf = hubOfNode(plan);
    const problems = plan.problems;
    const opacity = (hubId: string | null) => (focus && hubId !== focus ? DIM : 1);
    const pick = (hubId: string | null) => (e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        setFocus(hubId && hubId !== focus ? hubId : null);
    };
    const tint = (hubId: string) =>
        `#${new THREE.Color(colors.room).lerp(new THREE.Color(hubColor(hubId)), focus && focus !== hubId ? 0.05 : 0.22).getHexString()}`;

    // Dragging a hub: it slides over the floor (the camera stays put meanwhile);
    // on release the solver re-routes around its new spot. A press without a
    // move is a click: inspect that hub.
    const floorPoint = (e: ThreeEvent<PointerEvent>): XY | null => {
        const hit = new THREE.Vector3();
        return e.ray.intersectPlane(FLOOR_PLANE, hit) ? [hit.x, hit.z] : null;
    };
    const zoneRooms = drag ? plan.rooms.filter((r) => r.hub_id === drag.hubId) : [];
    const dropOk = !!drag && zoneRooms.some((r) => insidePolygon(drag.at, r.shape.outer.map((p) => toScene(plan, p))));
    const dragHandlers = (hubId: string) => ({
        onPointerDown: (e: ThreeEvent<PointerEvent>) => {
            e.stopPropagation();
            const at = floorPoint(e);
            if (busy || !at) return;
            if (!draggable) {
                setFocus(hubId !== focus ? hubId : null); // a baseline's hub: inspect only
                return;
            }
            (e.target as unknown as Element).setPointerCapture(e.pointerId);
            if (controls) controls.enabled = false;
            setDrag({ hubId, from: at, at });
        },
        onPointerMove: (e: ThreeEvent<PointerEvent>) => {
            const at = drag?.hubId === hubId ? floorPoint(e) : null;
            if (drag && at) setDrag({ ...drag, at });
        },
        onPointerUp: (e: ThreeEvent<PointerEvent>) => {
            if (drag?.hubId !== hubId) return;
            e.stopPropagation();
            (e.target as unknown as Element).releasePointerCapture(e.pointerId);
            if (controls) controls.enabled = true;
            setDrag(null);
            if (Math.hypot(drag.at[0] - drag.from[0], drag.at[1] - drag.from[1]) < 0.15) {
                setFocus(hubId !== focus ? hubId : null);
            } else {
                const [x, y] = fromScene(plan, drag.at);
                void moveHub(hubId, x, y);
            }
        },
        onPointerOver: () => {
            document.body.style.cursor = busy ? "wait" : draggable ? "grab" : "pointer";
        },
        onPointerOut: () => {
            document.body.style.cursor = "";
        },
    });

    return (
        <group>
            <FramePlan plan={plan} />
            <Screenshot name={`plan-${plan.plan_id}`} />

            {layers.rooms && (
                <ContactShadows key={frameKey(plan)} position={[stageX, -0.195, stageZ]}
                    scale={stageSpan * 1.35} opacity={0.4} blur={2.5} far={4} resolution={512} frames={1} />
            )}

            {layers.rooms && (
                <>
                    {/* The building's slab, then its floor: tinted by zone, or a
                        real finish with each zone's colour washed over it. */}
                    <Prisms plan={plan} shapes={floorShapes} bottom={-SLAB} top={0} color={colors.slab} />
                    {layers.floor === "zones" ? (
                        plan.rooms.map((r, i) => (
                            <RoomFloor key={i} plan={plan} shape={r.shape} color={r.hub_id ? tint(r.hub_id) : colors.room} />
                        ))
                    ) : (
                        <>
                            <Suspense fallback={<RoomFloorFallback plan={plan} shapes={floorShapes} color={colors.room} />}>
                                <TexturedFloor plan={plan} shapes={floorShapes} finish={layers.floor} />
                            </Suspense>
                            {plan.rooms.map((r, i) =>
                                r.hub_id ? (
                                    <RoomFloor key={i} plan={plan} shape={r.shape} color={hubColor(r.hub_id)}
                                        opacity={focus && focus !== r.hub_id ? 0.05 : 0.22} y={0.006} />
                                ) : null
                            )}
                        </>
                    )}
                    {!hasManualWalls && (layers.wallFinish !== "plain" ? (
                        <Suspense fallback={<PlanWalls plan={plan} doors={doors} wallTop={wallTop} wallColor={colors.wall} windowColor={colors.window} />}>
                            <TexturedPlanWalls key={layers.wallFinish} finish={layers.wallFinish} plan={plan} doors={doors} wallTop={wallTop} wallColor={colors.wall} windowColor={colors.window} />
                        </Suspense>
                    ) : (
                        <PlanWalls plan={plan} doors={doors} wallTop={wallTop} wallColor={colors.wall} windowColor={colors.window} />
                    ))}
                    {!hasManualWalls && <DoorLeaves plan={plan} doors={doors} height={wallTop} />}
                </>
            )}

            {layers.dimensions &&
                plan.rooms.map((r, i) => <RoomDimensions key={`dim${i}`} plan={plan} room={r} units={units} color={colors.dimension} />)}

            {layers.labels &&
                plan.rooms.map((r, i) => {
                    const [x, z] = toScene(plan, r.label_at);
                    // Flat on the floor, reading "up" the plan like the 2D view;
                    // nudged off the node marker that usually sits at the same spot.
                    return (
                        <group key={i} position={[x, 0.02, z - 0.75]} rotation={[-Math.PI / 2, 0, 0]}>
                            <Text fontSize={0.32} color={colors.label} anchorX="center" anchorY="bottom"
                                outlineWidth={0.015} outlineColor="#ffffff" raycast={noRaycast}>
                                {r.label}
                            </Text>
                            <Text position={[0, -0.04, 0]} fontSize={0.26} color={colors.dimension} anchorX="center" anchorY="top"
                                outlineWidth={0.015} outlineColor="#ffffff" raycast={noRaycast}>
                                {formatArea(r.area_m2, units)}
                            </Text>
                            {r.room_id && (
                                <Text position={[0, -0.36, 0]} fontSize={0.16} color={colors.ink} anchorX="center" anchorY="top"
                                    outlineWidth={0.012} outlineColor="#ffffff" raycast={noRaycast}>
                                    {r.hub_id ? `${r.room_id} → ${r.hub_id}` : r.room_id}
                                </Text>
                            )}
                        </group>
                    );
                })}

            {layers.cables && (
                <>
                    {rings.map(({ hub, path, faint }) => {
                        return (
                            <group key={`${hub.hub_id}-${faint ? "overlay" : "shown"}`}>
                                <Tube
                                    path={path}
                                    radius={faint ? CABLE_RADIUS * 0.6 : CABLE_RADIUS}
                                    color={faint ? colors.naive : hubColor(hub.hub_id)}
                                    opacity={opacity(hub.hub_id) * (faint ? 0.6 : 1)}
                                    onClick={faint ? undefined : pick(hub.hub_id)}
                                />
                                {layers.animate && !faint && opacity(hub.hub_id) === 1 && (
                                    <Pulses path={path} color={hubColor(hub.hub_id)} />
                                )}
                            </group>
                        );
                    })}

                    {layers.problems && problems && (
                        <>
                            {overlapPaths.map((path, i) => (
                                <Tube key={`o${i}`} path={path} radius={CABLE_RADIUS * 2.2} color={colors.warning} opacity={0.5} />
                            ))}
                            {problems.crossings.map((p, i) => {
                                const [x, z] = toScene(plan, p);
                                return (
                                    <mesh key={`x${i}`} position={[x, base + 0.05, z]} raycast={noRaycast}>
                                        <sphereGeometry args={[0.14, 16, 12]} />
                                        <meshStandardMaterial color={colors.warning} transparent opacity={0.75} />
                                    </mesh>
                                );
                            })}
                        </>
                    )}

                    {plan.nodes.map((n) => {
                        const [x, z] = toScene(plan, [n.x, n.y]);
                        const hubId = hubOf[n.node_id] ?? null;
                        const y = hubY[hubId ?? ""] ?? base;
                        const o = opacity(hubId);
                        return (
                            <group key={n.node_id} position={[x, 0, z]}>
                                <mesh position={[0, y, 0]} onClick={pick(hubId)}>
                                    <sphereGeometry args={[0.1, 16, 12]} />
                                    <meshStandardMaterial color="#ffffff" emissive={hubColor(hubId)} emissiveIntensity={0.35}
                                        transparent={o < 1} opacity={o} />
                                </mesh>
                                <Billboard position={[0, y + 0.35, 0]}>
                                    <Text fontSize={0.2} color={hubColor(hubId)} outlineWidth={0.015} outlineColor="#ffffff"
                                        fillOpacity={o} outlineOpacity={o} raycast={noRaycast}>
                                        {n.node_id}
                                    </Text>
                                </Billboard>
                            </group>
                        );
                    })}

                    {/* While dragging: the rooms this hub may stand in, and a hint. */}
                    {drag && (
                        <>
                            {zoneRooms.map((r, i) => (
                                <RoomFloor key={`zone${i}`} plan={plan} shape={r.shape} color={hubColor(drag.hubId)} opacity={0.45} y={0.012} />
                            ))}
                            <Billboard position={[drag.at[0], 1.3, drag.at[1]]}>
                                <Text fontSize={0.22} color={dropOk ? colors.label : colors.warning} outlineWidth={0.02} outlineColor="#ffffff" raycast={noRaycast}>
                                    {dropOk ? "Drop to re-route" : "Outside its rooms: it will snap back"}
                                </Text>
                            </Billboard>
                        </>
                    )}

                    {plan.hubs.map((h) => {
                        const dragging = drag?.hubId === h.hub_id;
                        const [x, z] = dragging ? drag.at : toScene(plan, [h.x, h.y]);
                        const y = hubY[h.hub_id];
                        const o = opacity(h.hub_id);
                        return (
                            <group key={h.hub_id} position={[x, 0, z]}>
                                {/* A small floor-standing cabinet (drag it to move the hub)... */}
                                <mesh position={[0, CABINET_HEIGHT / 2, 0]} {...dragHandlers(h.hub_id)}>
                                    <boxGeometry args={[0.3, CABINET_HEIGHT, 0.3]} />
                                    <meshStandardMaterial color={dragging && !dropOk ? colors.warning : hubColor(h.hub_id)}
                                        transparent={o < 1 || dragging} opacity={dragging ? 0.75 : o} />
                                </mesh>
                                {/* ...with a riser up to the ring when it runs higher. */}
                                {y > CABINET_HEIGHT && (
                                    <mesh position={[0, (CABINET_HEIGHT + y) / 2, 0]} raycast={noRaycast}>
                                        <cylinderGeometry args={[CABLE_RADIUS, CABLE_RADIUS, y - CABINET_HEIGHT, 8]} />
                                        <meshStandardMaterial color={hubColor(h.hub_id)} transparent={o < 1} opacity={o} />
                                    </mesh>
                                )}
                                <Billboard position={[0, Math.max(y, CABINET_HEIGHT) + 0.35, 0]}>
                                    <Text fontSize={0.24} color={hubColor(h.hub_id)} outlineWidth={0.02} outlineColor="#ffffff"
                                        fillOpacity={o} outlineOpacity={o} raycast={noRaycast}>
                                        {`${h.hub_id} · ${h.ring_length_m.toFixed(1)} m`}
                                    </Text>
                                </Billboard>
                            </group>
                        );
                    })}
                </>
            )}
        </group>
    );
}
