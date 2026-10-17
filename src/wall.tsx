import { useEffect, useRef } from "react"
import { Text, Billboard, Edges } from "@react-three/drei"
import { useFrame } from "@react-three/fiber"
import * as THREE from "three"

import { materials } from "./materials"
import SurfaceMaterial from "./SurfaceMaterial"
import { useEditor } from "./store"
import type { WallOpening } from "./store"
import { formatLength } from "./units"
import { themeColor } from "./themeColor"

// One solid box of wall in the wall's own frame: x runs along the wall
// (0 = the wall's centre), y is height above the floor.
type WallPiece = { x: number; y: number; width: number; height: number }

// An opening placed in the wall's frame: centre x plus bottom/top heights.
type Hole = WallOpening & { x: number; bottom: number; top: number }

// A box can't have a hole in it, so a wall with doors/windows is built from
// pieces: full-height pieces between the openings, a header above each
// opening, and a sill below each window.
function buildPieces(length: number, height: number, openings: WallOpening[]) {
  const pieces: WallPiece[] = []
  const holes: Hole[] = []
  let cursor = -length / 2 // left edge of the wall not yet covered

  for (const o of [...openings].sort((p, q) => p.offset - q.offset)) {
    // A 3D corner edit can shorten a wall after the plan was built: keep
    // each opening inside the wall, and skip one that no longer fits.
    if (o.width > length) continue
    const x = Math.min(Math.max(-length / 2 + o.offset, -length / 2 + o.width / 2), length / 2 - o.width / 2)
    const left = x - o.width / 2
    if (left < cursor - 1e-6) continue // would overlap the previous opening

    const bottom = Math.min(o.sill, height)
    const top = Math.min(o.sill + o.height, height)

    if (left > cursor) pieces.push({ x: (cursor + left) / 2, y: height / 2, width: left - cursor, height })
    if (top < height) pieces.push({ x, y: (top + height) / 2, width: o.width, height: height - top })
    if (bottom > 0) pieces.push({ x, y: bottom / 2, width: o.width, height: bottom })

    holes.push({ ...o, x, bottom, top })
    cursor = x + o.width / 2
  }

  if (cursor < length / 2) {
    pieces.push({ x: (cursor + length / 2) / 2, y: height / 2, width: length / 2 - cursor, height })
  }

  return { pieces, holes }
}

function Wall({
  start,
  end,
  height,
  thickness,
  materialId,
  selected,
  openings = [],
  animateIn = false,
  animateDelay = 0,
  animationRunId = 0,
}: {
  start: [number, number]
  end: [number, number]
  height: number
  thickness: number
  materialId: string
  selected: boolean
  openings?: WallOpening[]
  animateIn?: boolean
  animateDelay?: number
  animationRunId?: number
}) {
  const units = useEditor((s) => s.units)
  const wallRef = useRef<THREE.Group>(null)
  const startedAt = useRef<number | null>(null)
  const finished = useRef(!animateIn)

  useEffect(() => {
    if (!animateIn) return
    finished.current = false
    startedAt.current = null
    if (wallRef.current) wallRef.current.scale.y = 0
  }, [animationRunId, animateIn])

  useFrame(({ clock }) => {
    const wall = wallRef.current
    if (!wall || finished.current) return
    if (startedAt.current === null) startedAt.current = clock.getElapsedTime()
    const elapsed = clock.getElapsedTime() - startedAt.current - animateDelay
    if (elapsed <= 0) return
    const t = Math.min(elapsed / 1.5, 1)
    wall.scale.y = 1 - (1 - t) ** 3
    if (t === 1) finished.current = true
  })

  const dx = end[0] - start[0]
  const dz = end[1] - start[1]

  const length = Math.sqrt(dx * dx + dz * dz)

  const midX = (start[0] + end[0]) / 2
  const midZ = (start[1] + end[1]) / 2

  // Rotating by this turns local +x into the start -> end direction.
  const angle = -Math.atan2(dz, dx)

  const { pieces, holes } = buildPieces(length, height, openings)

  return (
    <>
      {/* Wall measurement */}
      <Billboard
        position={[
          midX,
          height / 2 + 0.5,
          midZ,
        ]}
      >
        <Text
          fontSize={0.3}
          color={themeColor("--color-ink", "#1f2a24")}
          material-depthTest={false}
        >
          {formatLength(length, units)}
        </Text>
      </Billboard>

      {/* Wall, built in its own frame around any door/window holes */}
      {/* userData.isWall marks this group for WallFader, which fades the wall
          the camera is looking through. */}
      <group
        ref={wallRef}
        position={[midX, 0, midZ]}
        rotation={[0, angle, 0]}
        scale={[1, animateIn ? 0 : 1, 1]}
        userData={{ isWall: true }}
      >
        {pieces.map((piece, i) => (
          <mesh key={`piece-${i}`} position={[piece.x, piece.y, 0]}>
            <boxGeometry args={[piece.width, piece.height, thickness*1.5]} />

            <SurfaceMaterial
              finish={materials[materialId]}
            />

            {/* Selection outline */}
            {selected && (
              <Edges color={themeColor("--color-selection", "#4f6b55")} />
            )}
          </mesh>
        ))}

        {holes.map((hole, i) =>
          hole.kind === "door" ? (
            // Closed door leaf, a little thinner than the wall
            <mesh key={`door-${i}`} position={[hole.x, (hole.bottom + hole.top) / 2, 0]}>
              <boxGeometry args={[hole.width - 0.04, hole.top - hole.bottom - 0.02, 0.04]} />
              <meshStandardMaterial color="#906137" />
            </mesh>
          ) : (
            // Window glass: see-through, and left alone by the wall fade
            <mesh
              key={`window-${i}`}
              position={[hole.x, (hole.bottom + hole.top) / 2, 0]}
              userData={{ keepOpacity: true }}
            >
              <boxGeometry args={[hole.width, hole.top - hole.bottom, 0.02]} />
              <meshPhysicalMaterial color="#bfe3ff" transparent opacity={0.35} roughness={0.05} />
            </mesh>
          )
        )}
      </group>
    </>
  )
}

export default Wall
