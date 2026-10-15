import { useTexture } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { asset } from "./assets";
const FLOOR_TEXTURES = {
  laminate: {
    map: asset("/textures/laminate_floor_02_diff_2k.jpg"),
    normalMap: asset("/textures/laminate_floor_02_nor_gl_2k.jpg"),
    roughnessMap: asset("/textures/laminate_floor_02_rough_2k.jpg"),
  },
  concrete: {
    map: asset("/textures/concrete_tile_facade_diff_2k.jpg"),
    normalMap: asset("/textures/concrete_tile_facade_nor_gl_2k.jpg"),
    roughnessMap:asset( "/textures/concrete_tile_facade_arm_2k.jpg"),
  },
} as const;

type FloorAssetId = keyof typeof FLOOR_TEXTURES;

function Floor({ assetId, length, width }: { assetId: FloorAssetId; length: number; width: number }) {
  const loaded = useTexture(FLOOR_TEXTURES[assetId]);

  // useTexture caches by URL, so the concrete wall finish gets the SAME texture
  // objects. Clone before setting repeat, or the two fight over the tiling.
  // Clones share the image, so nothing is downloaded or uploaded twice.
  const textures = useMemo(() => {
    const tile = (t: THREE.Texture) => {
      const c = t.clone();
      c.wrapS = c.wrapT = THREE.RepeatWrapping;
      c.repeat.set(3, 3);
      return c;
    };
    return { map: tile(loaded.map), normalMap: tile(loaded.normalMap), roughnessMap: tile(loaded.roughnessMap) };
  }, [loaded.map, loaded.normalMap, loaded.roughnessMap]);

  useEffect(() => () => Object.values(textures).forEach((t) => t.dispose()), [textures]);

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
      <planeGeometry args={[width, length]} />
      <meshStandardMaterial {...textures} />
    </mesh>
  );
}

export default Floor;
