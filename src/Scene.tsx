import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { PerspectiveCamera, OrthographicCamera } from "@react-three/drei"
import {
  Billboard,
  ContactShadows,
  Edges,
  Environment,
  OrbitControls,
  Text,
  TransformControls,
} from "@react-three/drei";
import { Suspense, useEffect, useState, useRef } from "react";
import * as THREE from "three";
import { useEditor } from "./store";
import { registory } from "./catalog";
import Wall from "./wall";
import Furniture from "./furniture";
import Floor from "./floor";
import { themeColor } from "./themeColor";
import WallFader from "./WallFader";
import CablePlan3D from "./cable/CablePlan3D";
import CableStage from "./cable/CableStage";
 import { footprintsOverlap } from "./2d/planGeometry"; 
// A floor footprint: the corners of a convex shape as [x, z], in order around it.
type Footprint = [number, number][];

// A wall's TRUE footprint — rotated with the wall. (An axis-aligned box around
// a diagonal wall would cover a huge triangle of floor and block furniture.)
function wallFootprint(start: [number, number, number], end: [number, number, number], thickness: number): Footprint {
  const dx = end[0] - start[0];
  const dz = end[2] - start[2];
  const len = Math.hypot(dx, dz) || 1;
  const ux = dx / len, uz = dz / len;   // unit vector along the wall
  const px = -dz / len, pz = dx / len;  // unit vector perpendicular (thickness)
  const half = len / 2, t = thickness / 2;
  const midX = (start[0] + end[0]) / 2, midZ = (start[2] + end[2]) / 2;
  return [
    [half, t], [half, -t], [-half, -t], [-half, t],
  ].map(([lx, lz]) => [midX + lx * ux + lz * px, midZ + lx * uz + lz * pz]);
}

function objectFootprint(o: THREE.Object3D): Footprint {
  const b = new THREE.Box3().setFromObject(o);
  return [[b.min.x, b.min.z], [b.max.x, b.min.z], [b.max.x, b.max.z], [b.min.x, b.max.z]];
}

// Collect every wall + every OTHER furniture item as an obstacle footprint.
function obstaclesFor(scene: THREE.Object3D | null, selfId: string): Footprint[] {
  const out: Footprint[] = [];
  const nodes = useEditor.getState().doc.nodes;
  for (const n of Object.values(nodes)) {
    if (n.id === selfId) continue;
    if (n.type === "wall") {
      out.push(wallFootprint(n.start, n.end, n.thickness));
    } else if (n.type === "furniture") {
      const o = scene?.getObjectByProperty("name", n.id) as THREE.Object3D | undefined;
      if (o) out.push(objectFootprint(o));
    }
  }
  return out;
}

// Separating-axis test: two convex shapes overlap unless some edge normal of
// either shape splits their projections apart.

// True if the live object `id` currently overlaps any wall or other furniture.
function overlapsObstacle(obj: THREE.Object3D, scene: THREE.Object3D | null, id: string): boolean {
  obj.updateMatrixWorld(true); // so Box3.setFromObject measures the CURRENT transform
  const foot = objectFootprint(obj);
  return obstaclesFor(scene, id).some((o) => footprintsOverlap(foot, o));
}

// True if placing `id` at (position, quat, scale) makes its footprint overlap any
// wall or other furniture. Moves the live object there first so it can be measured.
function furnitureCollides(id: string, scene: THREE.Object3D | null, position: THREE.Vector3, quat: THREE.Quaternion, scale: THREE.Vector3): boolean {
  const obj = scene?.getObjectByProperty("name", id) as THREE.Object3D | undefined;
  if (!obj) return false;
  obj.position.copy(position);
  obj.quaternion.copy(quat);
  obj.scale.copy(scale);
  return overlapsObstacle(obj, scene, id);
}

// --- WASD camera navigation (upright; OrbitControls preserved) ---------------

function WasdCamera({ speed = 6, active }: { speed?: number; active: boolean }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls); // OrbitControls (makeDefault)
  const keys = useRef<Record<string, boolean>>({});

  useEffect(() => {
    if (!active) return;
    const down = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
      if (e.key.startsWith("Arrow")) e.preventDefault(); // stop page scroll
      keys.current[e.key.toLowerCase()] = true;
    };
    const up = (e: KeyboardEvent) => { keys.current[e.key.toLowerCase()] = false; };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [active]);

  useFrame((_, delta) => {
    const k = keys.current;
    const controlsObj = controls as any;
    const target = controlsObj?.target as THREE.Vector3 | undefined;
    const minY = 0;
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0; forward.normalize();
    const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();
    const worldUp = new THREE.Vector3(0, 1, 0);


    const move = new THREE.Vector3();
    if (k["w"]) move.add(forward);
    if (k["s"]) move.sub(forward);
    if (k["d"]) move.add(right);
    if (k["a"]) move.sub(right);
    if (k["arrowup"]) move.add(worldUp);
    if (k["arrowdown"]) move.sub(worldUp);

    let yaw = 0;
    const rotSpeed = 0.8;
    if (k["arrowleft"]) yaw += rotSpeed * delta;
    if (k["arrowright"]) yaw -= rotSpeed * delta;

    if (move.lengthSq() === 0 && yaw === 0) return;

    if (move.lengthSq() > 0) {
      move.normalize().multiplyScalar(speed * delta);
      camera.position.add(move);
      target?.add(move);
      if (camera.position.y < minY) camera.position.y = minY;
    }

    if (yaw !== 0 && target) {

      const offset = new THREE.Vector3().subVectors(target, camera.position);
      offset.applyAxisAngle(worldUp, yaw);
      target.copy(camera.position).add(offset);
    }

    controlsObj?.update?.();
  });

  return null;
}

function Scene({ active, animationRunId }: { active: boolean; animationRunId: number }) {
  // three.js materials need real colour strings, so read them from theme.css once.
  const [colors] = useState(() => ({
    background: themeColor("--color-scene-background", "#f7f6f1"),
    ground: themeColor("--color-scene-ground", "#dcdfd3"),
    handle: themeColor("--color-scene-handle", "#4f6b55"),
    handleAlt: themeColor("--color-scene-handle-alt", "#b5533c"),
  }));

  const moveCorner = useEditor((s) => s.moveCorner)
  const cameraMode = useEditor((s) => s.cameraMode)
  const updateNode = useEditor((s) => s.updateNode)
  const nodes = useEditor((s) => s.doc.nodes);
  const hasCablePlan = useEditor((s) => s.doc.cablePlan !== null);
  const select = useEditor((s) => s.select);
  const selectedIds = useEditor((s) => s.selectedIds);
  const updateTransform = useEditor((s) => s.updateTransform);
  const removeNode = useEditor((s) => s.removeNode);
  const mode = useEditor((s) => s.mode);
  const setMode = useEditor((s) => s.setMode);
  const [selectedHandle, setSelectedHandle] = useState<
    | { kind: "wall"; id: string; which: "start" | "end" | "move"; origin: [number, number, number] }
    | { kind: "floor"; id: string; dimension: "width" | "length"; side: "min" | "max" }
    | null
  >(null)


  const [contextLost, setContextLost] = useState(false);

  // Keep the plan-wall animation stagger in insertion order without rescanning
  // every preceding node for each wall (which made scene rendering quadratic).
  const sceneNodes = Object.values(nodes);
  const wallAnimationDelays = new Map<string, number>();
  let planWallIndex = 0;
  for (const node of sceneNodes) {
    if (node.type === "wall" && node.fromPlan) {
      wallAnimationDelays.set(node.id, planWallIndex * 0.08);
      planWallIndex += 1;
    }
  }

  useEffect(() => {
    const counts: Record<string, number> = {};
    for (const n of Object.values(nodes)) counts[n.type] = (counts[n.type] ?? 0) + 1;
    console.log("[Scene] nodes changed:", JSON.stringify(counts), "total:", Object.keys(nodes).length);
  }, [nodes]);

  useEffect(() => {
    console.log("[Scene] MOUNTED (canvas active)");
    
    return () => console.log("[Scene] UNMOUNTED (canvas torn down)");
  }, []);

  const [proxy, setProxy] = useState<THREE.Object3D | null>(null);
  // Set at drag start: an item that ALREADY overlaps something (e.g. it spawned
  // inside a wall) must still be draggable out, so blocking is skipped.
  const dragStartedOverlapping = useRef(false);

  let targetPos: [number, number, number] | null = null;
  let targetQuat: [number, number, number, number] = [0, 0, 0, 1];
  let targetScale: [number, number, number] = [1, 1, 1];
  if (selectedHandle?.kind === "wall") {
    targetPos = selectedHandle.origin;
  } else if (selectedHandle?.kind === "floor") {
    const n = nodes[selectedHandle.id];
    if (n?.type === "Floor") {
      const cx = n.transform.position[0];
      const cz = n.transform.position[2];
      if (selectedHandle.dimension === "width") {
        targetPos = [cx + (selectedHandle.side === "min" ? -1 : 1) * (n.width / 2), 0.15, cz];
      } else {
        targetPos = [cx, 0.15, cz + (selectedHandle.side === "min" ? -1 : 1) * (n.length / 2)];
      }
    }
  }
  else if (selectedIds[0]) {
    const n = nodes[selectedIds[0]];
    if (n) {
      targetPos = n.transform.position;
      targetQuat = n.transform.rotation;
      targetScale = n.transform.scale;
    }
  }
  const hasSelection = targetPos !== null;


  const posKey = targetPos ? targetPos.join(",") : "";
  const quatKey = targetQuat.join(",");
  const scaleKey = targetScale.join(",");
  useEffect(() => {
    if (proxy && targetPos) {
      proxy.position.set(targetPos[0], targetPos[1], targetPos[2]);
      proxy.quaternion.set(targetQuat[0], targetQuat[1], targetQuat[2], targetQuat[3]);
      proxy.scale.set(targetScale[0], targetScale[1], targetScale[2]);
    }

  }, [proxy, posKey, quatKey, scaleKey]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: any) => {
      const el = document.activeElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
      if ((e.key === "Delete" || e.key === "Backspace") && selectedIds[0]) {
        removeNode(selectedIds[0]);
        select([]);
        setSelectedHandle(null)
      }
      if (e.key === "t") setMode("translate");
      if (e.key === "r") setMode("rotate");
      if (e.key === "e") setMode("scale");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, selectedIds, removeNode, select, setMode]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {contextLost && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 50,
            background: "var(--color-warning)",
            color: "var(--color-accent-contrast)",
            padding: "8px 12px",
            fontFamily: "sans-serif",
            textAlign: "center",
          }}
        >
          WebGL context was lost (GPU reset). The view will recover
          automatically — if it stays blank, hard-refresh (Cmd/Ctrl+Shift+R).
        </div>
      )}
      <Canvas

        style={{ width: "100%", height: "100%" }}
        frameloop={active ? "always" : "demand"}
        camera={{ position: [8, 8, 8], fov: 50 }}
        onCreated={({ gl }) => {
          const canvas = gl.domElement;
          canvas.addEventListener(
            "webglcontextlost",
            (e) => {
              e.preventDefault();
              setContextLost(true);
            },
            false
          );
          canvas.addEventListener(
            "webglcontextrestored",
            () => {
              setContextLost(false);
            },
            false
          );
        }}
        onPointerMissed={() => {
          select([]);
          setSelectedHandle(null);
        }}
      >
        <color attach="background" args={[hasCablePlan ? "#344a50" : colors.background]} />
        <object3D ref={setProxy} />
        {hasCablePlan ? <CableStage /> : (
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]}>
            <planeGeometry args={[100, 100]} />
            <meshBasicMaterial color={colors.ground} />
          </mesh>
        )}
        {hasCablePlan && (
          <>
            <hemisphereLight args={["#eef4e9", "#6e8176", 0.3]} />
            <directionalLight position={[-8, 18, 12]} intensity={1.35} color="#fff4dc" />
          </>
        )}
        {cameraMode === "topdown" ? (
          <OrthographicCamera makeDefault position={[0, 30, 0]} zoom={50} near={0.1} far={1000} />
        ) :
          <PerspectiveCamera makeDefault position={[8, 8, 8]} fov={50} />
        }
        <OrbitControls
          makeDefault
          enabled={active}
          enableRotate={cameraMode !== "topdown"}
          minPolarAngle={cameraMode === "topdown" ? 0 : 0}
          maxPolarAngle={cameraMode === "topdown" ? 0 : Math.PI / 2}
        />
        <WasdCamera active={active} />
        <WallFader />

        {/* Grounds the editor's own furniture at the origin; a cable plan has its own slab. */}
        {!hasCablePlan && <ContactShadows position={[0, 0., 0]} opacity={2} scale={10} blur={2} />}

        <Suspense fallback={null}>
          <Environment preset="apartment" />
        </Suspense>
        <Suspense fallback={null}>

          {/* An imported Cable Ring plan (read-only), if there is one. */}
          <CablePlan3D animationRunId={animationRunId} />

          {sceneNodes.map((node) => {
            if (node.type === "wall") {
              const sx = node.start[0], sz = node.start[2];
              const ex = node.end[0], ez = node.end[2];
              const dx = ex - sx, dz = ez - sz;
              const wlen = Math.hypot(dx, dz) || 1;
              const ox = dx / wlen, oz = dz / wlen;
              const off = 0.4;

              const startPos: [number, number, number] = [sx - ox * off, 0, sz - oz * off];
              const endPos: [number, number, number] = [ex + ox * off, 0, ez + oz * off];
              return (

                <group
                  key={node.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    select([node.id]);

                    setSelectedHandle({
                      kind: "wall",
                      id: node.id,
                      which: "move",
                      origin: [
                        (node.start[0] + node.end[0]) / 2,
                        0,
                        (node.start[2] + node.end[2]) / 2,
                      ],
                    });
                  }}
                >
                  {selectedIds.includes(node.id) && (
                    <>
                      <mesh position={startPos}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedHandle({ kind: "wall", id: node.id, which: "start", origin: [node.start[0], 0, node.start[2]] })
                          select([node.id])
                        }}>
                        <sphereGeometry args={[0.25, 16, 16]} />
                        <meshBasicMaterial color={colors.handle} depthTest={false} />

                      </mesh>
                      <mesh position={endPos}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedHandle({ kind: "wall", id: node.id, which: "end", origin: [node.end[0], 0, node.end[2]] })
                          select([node.id])
                        }}
                      >
                        <sphereGeometry args={[0.25, 16, 16]} />
                        <meshBasicMaterial color={colors.handle} depthTest={false} />

                      </mesh>
                      <mesh position={[(node.start[0] + node.end[0]) / 2, 0, (node.start[2] + node.end[2]) / 2]}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedHandle({ kind: "wall", id: node.id, which: "move", origin: [(node.start[0] + node.end[0]) / 2, 0, (node.start[2] + node.end[2]) / 2] })
                          select([node.id])
                        }}>
                        <sphereGeometry args={[0.28, 16, 16]} />
                        <meshBasicMaterial color={colors.handleAlt} depthTest={false} />
                      </mesh>
                    </>
                  )}
                  <Wall

                    key={node.id}
                    start={[node.start[0], node.start[2]]}
                    end={[node.end[0], node.end[2]]}
                    height={node.height}
                    thickness={node.thickness}
                    materialId={node.materialId}
                    selected={selectedIds.includes(node.id)}
                    openings={node.openings}
                    animationRunId={animationRunId}
                    animateIn={node.fromPlan}
                    animateDelay={wallAnimationDelays.get(node.id) ?? 0}
                  />
                </group>

              );
            }
            if (node.type === "Floor") {
              return (
                <group
                  key={node.id}
                  position={node.transform.position}
                  quaternion={node.transform.rotation}
                  scale={node.transform.scale}
                  onClick={(e) => {
                    e.stopPropagation();
                    select([node.id]);
                    setSelectedHandle(null);
                  }}>
                  <Floor
                    assetId={node.assetId}
                    length={node.length}
                    width={node.width}
                  />
                  {selectedIds.includes(node.id) && (
                    <>
                      <mesh
                        position={[-node.width / 2, 0.25, 0]}
                        onClick={(e) => {
                          e.stopPropagation();
                          select([node.id]);
                          setSelectedHandle({ kind: "floor", id: node.id, dimension: "width", side: "min" });
                        }}
                      >
                        <sphereGeometry args={[0.18, 16, 16]} />
                        <meshBasicMaterial color={colors.handle} depthTest={false} />
                      </mesh>
                      <mesh
                        position={[node.width / 2, 0.15, 0]}
                        onClick={(e) => {
                          e.stopPropagation();
                          select([node.id]);
                          setSelectedHandle({ kind: "floor", id: node.id, dimension: "width", side: "max" });
                        }}
                      >
                        <sphereGeometry args={[0.18, 16, 16]} />
                        <meshBasicMaterial color={colors.handle} depthTest={false} />
                      </mesh>
                      <mesh
                        position={[0, 0.15, -node.length / 2]}
                        onClick={(e) => {
                          e.stopPropagation();
                          select([node.id]);
                          setSelectedHandle({ kind: "floor", id: node.id, dimension: "length", side: "min" });
                        }}
                      >
                        <sphereGeometry args={[0.18, 16, 16]} />
                        <meshBasicMaterial color={colors.handle} depthTest={false} />
                      </mesh>
                      <mesh
                        position={[0, 0.15, node.length / 2]}
                        onClick={(e) => {
                          e.stopPropagation();
                          select([node.id]);
                          setSelectedHandle({ kind: "floor", id: node.id, dimension: "length", side: "max" });
                        }}
                      >
                        <sphereGeometry args={[0.18, 16, 16]} />
                        <meshBasicMaterial color={colors.handle} depthTest={false} />
                      </mesh>
                    </>
                  )}
                </group>
              )

            }
            if (node.type === "furniture") {
              const url = registory[node.assetId];
              if (url) {

                const p = node.transform.position;
                return (
                  <group
                    key={node.id}
                    name={node.id}
                    position={[p[0], p[1], p[2]]}
                    quaternion={node.transform.rotation}
                    scale={node.transform.scale}
                    onClick={(e) => {
                      e.stopPropagation();
                      select([node.id]);
                      setSelectedHandle(null);
                    }}
                  >
                    <Suspense fallback={
                      <mesh>
                        <boxGeometry args={[1, 1, 1]} />
                        <meshStandardMaterial color="#cccccc" transparent opacity={0.5} />
                      </mesh>
                    }>
                      <Furniture url={url} id={node.assetId} />
                    </Suspense>
                  </group>
                );
              }
            }
            if (node.type === "light") {
              return (
                <mesh key={node.id}
                  name={node.id}
                  position={node.transform.position}
                  onClick={(e) => {
                    e.stopPropagation();
                    select([node.id])
                    setSelectedHandle(null);
                  }}>
                  <sphereGeometry args={[0.15, 16, 16]} />
                  <meshBasicMaterial color={"yellow"} />
                  <pointLight intensity={node.intensity} color={node.color} />
                </mesh>
              )
            }
            // A 2D symbol with no matching 3D model: a see-through box of the
            // right real-world size, captioned so you can tell a bathtub from a
            // toilet at a glance.
            if (node.type === "placeholder") {
              return (
                <group
                  key={node.id}
                  name={node.id}
                  position={node.transform.position}
                  quaternion={node.transform.rotation}
                  onClick={(e) => {
                    e.stopPropagation();
                    select([node.id]);
                    setSelectedHandle(null);
                  }}
                >
                  {/* The node's y is 0, meaning "bottom on the floor", but a box
                      is positioned by its CENTRE - so lift it half its height or
                      it sinks through the floor. The offset lives here on the
                      mesh, not on the node, so y=0 keeps meaning the same thing
                      everywhere else. */}
                  <mesh position={[0, node.height / 2, 0]}>
                    {/* boxGeometry wants width (x), height (y), depth (z) - NOT
                        the order the node stores them in. */}
                    <boxGeometry args={[node.width, node.height, node.depth]} />
                    <meshStandardMaterial
                      color={themeColor("--color-accent", "#4f6b55")}
                      transparent
                      opacity={0.45}
                    />
                    {selectedIds.includes(node.id) && (
                      <Edges color={themeColor("--color-selection", "#4f6b55")} />
                    )}
                  </mesh>

                  {/* Billboard keeps the caption turned towards the camera, so
                      it never ends up edge-on and unreadable. */}
                  <Billboard position={[0, node.height + 0.25, 0]}>
                    <Text
                      fontSize={0.2}
                      color={themeColor("--color-ink", "#1f2a24")}
                      material-depthTest={false}
                    >
                      {node.name}
                    </Text>
                  </Billboard>
                </group>
              );
            }

            return (
              <mesh
                key={node.id}
                position={node.transform.position}
                scale={node.transform.scale}
                onClick={(e) => {
                  e.stopPropagation();
                  select([node.id]);
                  setSelectedHandle(null);
                }}
              >
                <boxGeometry args={[1, 1, 1]} />
                <meshStandardMaterial color={selectedIds.includes(node.id) ? "blue" : "green"} />
              </mesh>
            );
          })}
        </Suspense>

        {active && hasSelection && proxy && (
          <TransformControls
            translationSnap={0.25}
            rotationSnap={Math.PI / 12}
            object={proxy}
            mode={mode}

            onMouseDown={() => {
              const id = selectedIds[0];
              const obj = id ? proxy.parent?.getObjectByProperty("name", id) : undefined;
              dragStartedOverlapping.current =
                !selectedHandle && !!obj && nodes[id]?.type === "furniture" &&
                overlapsObstacle(obj, proxy.parent ?? null, id);
            }}

            // Live tracking: while dragging the proxy, copy its transform onto the
            // REAL selected object so it follows the gizmo. The store is only
            // written on mouse-up, so undo stays a single step.
            onObjectChange={() => {
              const id = selectedIds[0];
              if (!id) return;
              const n = nodes[id];
              // The GLB is baked so its bottom sits at the group origin; node Y
              // directly equals the floor height, so we copy the proxy transform
              // straight through (no groundOffset to add). Non-furniture nodes
              // are copied the same way.
              if (selectedHandle?.kind === "wall" || selectedHandle?.kind === "floor") {
                proxy.position.y = Math.max(0, proxy.position.y);
              } else if (!selectedHandle) {
                // plain node selection (furniture, lights, boxes) — never let it sink below floor
                proxy.position.y = Math.max(0, proxy.position.y);
              }
              const obj = proxy.parent?.getObjectByProperty("name", id) as THREE.Object3D | undefined;
              // Walls/floors aren't dragged live by their GROUP: walls draw from
              // start/end, floors recenter on resize. Moving their GROUP here would
              // drag the whole thing with the gizmo. They update only on mouse-up.
              // Furniture/lights follow the gizmo live.
              const isHandle = selectedHandle?.kind === "wall" || selectedHandle?.kind === "floor";
              if (obj && !isHandle) {
                obj.position.set(proxy.position.x, proxy.position.y, proxy.position.z);
                obj.quaternion.copy(proxy.quaternion);
                obj.scale.copy(proxy.scale);
                // Collision prevention: block furniture from entering walls
                // or other furniture. We test the dragged item's world footprint
                // against every obstacle; on overlap we revert to the last
                // committed transform so the drag simply "sticks" at the boundary.
                if (n?.type === "furniture" && !dragStartedOverlapping.current &&
                  overlapsObstacle(obj, proxy.parent ?? null, id)) {
                  const last = n.transform;
                  obj.position.set(last.position[0], last.position[1], last.position[2]);
                  obj.quaternion.set(last.rotation[0], last.rotation[1], last.rotation[2], last.rotation[3]);
                  obj.scale.set(last.scale[0], last.scale[1], last.scale[2]);
                  proxy.position.set(last.position[0], last.position[1], last.position[2]);
                  proxy.quaternion.set(last.rotation[0], last.rotation[1], last.rotation[2], last.rotation[3]);
                  proxy.scale.set(last.scale[0], last.scale[1], last.scale[2]);
                  return;
                }
              }
            }}
            onMouseUp={() => {
              const p = proxy.position;
              const q = proxy.quaternion;
              if (selectedHandle?.kind === "wall") {
                if (selectedHandle.which === "move") {
                  const wall = nodes[selectedHandle.id];
                  if (wall?.type === "wall") {
                    const dx = p.x - selectedHandle.origin[0];
                    const dz = p.z - selectedHandle.origin[2];
                    updateNode(selectedHandle.id, {
                      start: [wall.start[0] + dx, 0, wall.start[2] + dz],
                      end: [wall.end[0] + dx, 0, wall.end[2] + dz],
                    });
                    setSelectedHandle({ ...selectedHandle, origin: [p.x, 0, p.z] });
                  }
                } else {
                  const target: [number, number, number] = [p.x, 0, p.z];
                  // Snap this wall's end onto a nearby existing corner so walls can
                  // be joined by dropping one end onto another. We move ONLY the
                  // dragged wall's endpoint — other walls keep their own corners
                  // (no auto-fusion) — so dragging one side extends just that side.
                  let snapped: [number, number, number] = target;
                  for (const n of Object.values(nodes)) {
                    if (n.type !== "wall") continue;
                    for (const pt of [n.start, n.end]) {
                      const dist = Math.hypot(pt[0] - target[0], pt[2] - target[2]);
                      if (dist < 0.4) snapped = [pt[0], 0, pt[2]];
                    }
                  }
                  // moveCorner moves EVERY wall endpoint sitting at the original
                  // corner onto `snapped`, so walls that share a corner stay joined
                  // (this is the "move a corner" behaviour that was lost).
                  moveCorner(selectedHandle.origin, snapped);
                  setSelectedHandle({ ...selectedHandle, origin: snapped });
                }
              } else if (selectedHandle?.kind === "floor") {
                const fl = nodes[selectedHandle.id];
                if (fl?.type === "Floor") {
                  const cx = fl.transform.position[0];
                  const cz = fl.transform.position[2];
                  const posY = fl.transform.position[1];
                  if (selectedHandle.dimension === "width") {
                    // keep the OPPOSITE edge fixed; grow only the dragged side
                    const fixedMin = cx - fl.width / 2;
                    const fixedMax = cx + fl.width / 2;
                    let newWidth: number, newCenterX: number;
                    if (selectedHandle.side === "max") {
                      const m = p.x;
                      newWidth = Math.max(0.1, m - fixedMin);
                      newCenterX = (fixedMin + m) / 2;
                    } else {
                      const m = p.x;
                      newWidth = Math.max(0.1, fixedMax - m);
                      newCenterX = (m + fixedMax) / 2;
                    }
                    updateNode(selectedHandle.id, {
                      width: newWidth,
                      transform: { ...fl.transform, position: [newCenterX, posY, cz] },
                    });
                  } else {
                    const fixedMin = cz - fl.length / 2;
                    const fixedMax = cz + fl.length / 2;
                    let newLength: number, newCenterZ: number;
                    if (selectedHandle.side === "max") {
                      const m = p.z;
                      newLength = Math.max(0.1, m - fixedMin);
                      newCenterZ = (fixedMin + m) / 2;
                    } else {
                      const m = p.z;
                      newLength = Math.max(0.1, fixedMax - m);
                      newCenterZ = (m + fixedMax) / 2;
                    }
                    updateNode(selectedHandle.id, {
                      length: newLength,
                      transform: { ...fl.transform, position: [cx, posY, newCenterZ] },
                    });
                  }
                }
                setSelectedHandle(null);
              } else {
                const n = nodes[selectedIds[0]];
                // Safety net: refuse to commit a placement that overlaps a wall or
                // other furniture, even if the live drag slipped through.
                const finalPos = new THREE.Vector3(p.x, p.y, p.z);
                const finalQuat = new THREE.Quaternion(q.x, q.y, q.z, q.w);
                const s = proxy.scale;
                if (n?.type === "furniture" && !dragStartedOverlapping.current &&
                  furnitureCollides(selectedIds[0], proxy.parent ?? null, finalPos, finalQuat, s.clone())) {
                  const last = n.transform;
                  const obj = proxy.parent?.getObjectByProperty("name", selectedIds[0]) as THREE.Object3D | undefined;
                  if (obj) {
                    obj.position.set(last.position[0], last.position[1], last.position[2]);
                    obj.quaternion.set(last.rotation[0], last.rotation[1], last.rotation[2], last.rotation[3]);
                    obj.scale.set(last.scale[0], last.scale[1], last.scale[2]);
                  }
                  proxy.position.set(last.position[0], last.position[1], last.position[2]);
                  proxy.quaternion.set(last.rotation[0], last.rotation[1], last.rotation[2], last.rotation[3]);
                  proxy.scale.set(last.scale[0], last.scale[1], last.scale[2]);
                  return;
                }
                updateTransform(selectedIds[0], {
                  position: [p.x, p.y, p.z],
                  rotation: [q.x, q.y, q.z, q.w],
                  scale: [s.x, s.y, s.z],
                });
              }


            }}
          />
        )}
      </Canvas>
    </div>
  );
}

export default Scene;
