import { useGLTF, Clone } from "@react-three/drei";
import { useLayoutEffect, useState } from "react";
import * as THREE from "three";
import { FURNITURE_BY_ID } from "./catalog";

function Furniture({ url, id }: { url: string; id: string }) {
  const gltf = useGLTF(url);
 
  const [lift, setLift] = useState(0);

  useLayoutEffect(() => {
    const entry = FURNITURE_BY_ID[id];
    if (!entry) return;
    if (typeof entry.lift === "number") {
      setLift(entry.lift);
      return;
    }
    if (!gltf?.scene) return;
    gltf.scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(gltf.scene);
    const size = box.getSize(new THREE.Vector3());
    const s = entry.scale ?? 1;
    const footprint: [number, number] = [
      +Math.max(size.x * s, 0.01).toFixed(2),
      +Math.max(size.z * s, 0.01).toFixed(2),
    ];

    const nativeLift = -box.min.y;
    FURNITURE_BY_ID[id] = { ...entry, footprint, lift: nativeLift };
    setLift(nativeLift);
  }, [id, gltf]);

  return (
    <group>
      <group position={[0, lift, 0]}>
        <Clone object={gltf.scene} />
      </group>
    </group>
  );
}

export default Furniture;
