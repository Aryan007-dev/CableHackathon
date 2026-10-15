// Wall/surface finishes. materialId on a node points at one of these.

import { asset } from "./assets";

// (Rung 1: paint colours only. Textured finishes come next.)
export type ColorFinish   = { kind: "color";   color: string }
export type TextureFinish = { kind: "texture"; map: string; normalMap: string; roughnessMap: string; repeat: number }
export type Finish = ColorFinish | TextureFinish

export const materials: Record<string, Finish> = {
  wall: { kind: "color", color: "#68778b" },
  "warm-white": { kind: "color",color: "#f3ede3" },
  sage: { kind: "color",color: "#9caf88" },
  clay: { kind: "color",color: "#b5651d" },
  charcoal: {kind: "color", color: "#3a3a3a" },
  concrete: {
  kind: "texture",
  map:         asset("/textures/concrete_tile_facade_diff_2k.jpg"),
  normalMap:   asset("/textures/concrete_tile_facade_nor_gl_2k.jpg"),
  roughnessMap:asset("/textures/concrete_tile_facade_arm_2k.jpg"),   // ARM → green = roughness
  repeat: 4,

},
brick: {
  kind: "texture",
  map:         asset("/textures/exterior_wall_cladding_02_diff_2k.jpg"),
  normalMap:   asset("/textures/exterior_wall_cladding_02_nor_gl_2k.jpg"),
  roughnessMap:asset("/textures/exterior_wall_cladding_02_arm_2k.jpg"),   // ARM → green = roughness
  repeat: 1,

},
}
