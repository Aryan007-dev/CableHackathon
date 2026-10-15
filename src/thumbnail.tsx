import React, { Suspense, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Canvas, useThree } from "@react-three/fiber";
import { useGLTF, Environment, Lightformer } from "@react-three/drei";
import * as THREE from "three";

const params = new URLSearchParams(window.location.search);
const MODEL_URL = params.get("model") ?? "";

declare global {
  interface Window {
    __ready?: boolean;
  }
}

function Model({ url, onSize }: { url: string; onSize: (s: number) => void }) {
  const { scene } = useGLTF(url);

  // Center the model on the origin so the camera can frame it.
  const [size] = useState(() => {
    const box = new THREE.Box3().setFromObject(scene);
    const center = box.getCenter(new THREE.Vector3());
    const dimensions = box.getSize(new THREE.Vector3());
    scene.position.sub(center);
    return Math.max(dimensions.x, dimensions.y, dimensions.z) || 1;
  });

  useEffect(() => {
    onSize(size);
  }, [size, onSize]);

  return <primitive object={scene} />;
}

// Pull the camera back just far enough to fit the model's bounding box.
function Framing({ size }: { size: number }) {
  const { camera } = useThree();
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    const fov = cam.fov * (Math.PI / 180);
    // Frame the model's bounding-sphere radius with a little padding so
    // it fills most of the thumbnail instead of sitting far away.
    const radius = size / 2;
    const dist = (radius * 1.15) / Math.tan(fov / 2);
    cam.position.set(dist * 0.8, dist * 0.6, dist * 0.8);
    cam.lookAt(0, 0, 0);
    cam.updateProjectionMatrix();
    // Give R3F two frames to actually paint before we screenshot.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      window.__ready = true;
    }));
  }, [size, camera]);
  return null;
}

// If a model fails to load (e.g. Draco decoder offline) don't hang the
// pipeline forever — flag ready so the script moves on.
class LoadBoundary extends React.Component<{ onError: () => void; children: React.ReactNode }> {
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.props.children;
  }
}

function Scene() {
  const [size, setSize] = useState(1);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (failed) window.__ready = true;
  }, [failed]);

  return (
    <Canvas
      camera={{ fov: 45, position: [3, 2, 3] }}
      shadows
      dpr={[1, 2]}
      gl={{ toneMappingExposure: 1.35 }}
    >
      <color attach="background" args={["#eef0f3"]} />
      <ambientLight intensity={0.9} />
      <hemisphereLight args={["#ffffff", "#cfd3d8", 1.1]} />
      <directionalLight position={[4, 8, 5]} intensity={2.6} castShadow />
      <directionalLight position={[-5, 3, -4]} intensity={0.9} />
      {/* Procedural env map (no network) so metallic/rough PBR
          materials have something to reflect instead of going black. */}
      <Environment resolution={256} frames={1}>
        <Lightformer intensity={2.2} position={[0, 4, 2]} scale={[10, 10, 1]} />
        <Lightformer intensity={1.1} position={[-4, 1, 4]} scale={[6, 6, 1]} color="#fff6e8" />
        <Lightformer intensity={0.8} position={[4, 1, -4]} scale={[6, 6, 1]} color="#e8f0ff" />
      </Environment>
      <Suspense fallback={null}>
        <LoadBoundary onError={() => setFailed(true)}>
          {MODEL_URL && <Model url={MODEL_URL} onSize={setSize} />}
        </LoadBoundary>
        <Framing size={size} />
      </Suspense>
    </Canvas>
  );
}

createRoot(document.getElementById("root")!).render(<Scene />);
