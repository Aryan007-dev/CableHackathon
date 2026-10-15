import { useFrame, useThree } from "@react-three/fiber"
import { useRef } from "react"
import * as THREE from "three"

const FADED_OPACITY = 0.3

// Fades the wall the camera is looking through, so you can see into the room.
//
// One raycast per frame for the whole scene, tested against WALLS ONLY. Each
// wall used to raycast the entire scene itself, and furniture models are
// 80k-230k triangles each: whenever the ray passed through furniture, every
// wall tested all of those triangles every frame, which dropped the frame
// rate to 2-3 fps. Walls are a handful of simple boxes, so this stays cheap
// no matter what furniture is in the room.
export default function WallFader() {
  const camera = useThree((s) => s.camera)
  const scene = useThree((s) => s.scene)

  // Reused every frame instead of allocating new ones.
  const raycaster = useRef(new THREE.Raycaster())
  const direction = useRef(new THREE.Vector3())
  const walls = useRef<THREE.Object3D[]>([])

  useFrame(() => {
    // 1. Collect the wall groups (marked with userData.isWall in wall.tsx).
    //    This visits scene objects, not triangles, so it's cheap.
    const list = walls.current
    list.length = 0
    scene.traverse((object) => {
      if (object.userData.isWall === true) list.push(object)
    })

    // 2. Shoot one ray from the camera in the direction it's looking, and
    //    find the nearest wall piece it hits.
    camera.getWorldDirection(direction.current)
    raycaster.current.set(camera.position, direction.current)
    const hit = raycaster.current.intersectObjects(list, true)[0]

    // 3. The hit is a piece inside a wall group; climb up to that group.
    let faded: THREE.Object3D | null = hit?.object ?? null
    while (faded && faded.userData.isWall !== true) faded = faded.parent

    // 4. Fade that wall, show the rest solid. Window glass keeps its own
    //    see-through opacity.
    for (const wall of list) {
      const opacity = wall === faded ? FADED_OPACITY : 1
      wall.traverse((object) => {
        if (!(object instanceof THREE.Mesh) || object.userData.keepOpacity) return

        const materials = Array.isArray(object.material) ? object.material : [object.material]
        for (const material of materials) {
          if (!material.transparent) {
            material.transparent = true
            material.needsUpdate = true
          }
          material.opacity = opacity
        }
      })
    }
  })

  return null
}
