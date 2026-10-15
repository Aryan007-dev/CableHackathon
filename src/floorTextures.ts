// PBR texture sets for floors: the editor's Floor node and the cable plan's
// floor (src/cable/CablePlan3D.tsx) both use these.
import { asset } from "./assets";

export const FLOOR_TEXTURES = {
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
