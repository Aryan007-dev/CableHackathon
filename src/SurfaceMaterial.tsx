import { useTexture } from "@react-three/drei"
import { useEffect, useMemo } from "react"
import * as THREE from "three"
import type { Finish, TextureFinish } from "./materials"

function ColorMaterial({ color }: { color: string }) {
  return <meshStandardMaterial color={color} />
}

function TextureMaterial({finish}:{finish:TextureFinish}){
    const loaded =useTexture({
        map : finish.map,
        normalMap : finish.normalMap,
        roughnessMap: finish.roughnessMap
    })
    // useTexture caches by URL and the floor may share these files, so clone
    // before setting repeat (clones share the image, not the tiling).
    const textures = useMemo(()=>{
        const tile = (t: THREE.Texture) => {
            const c = t.clone()
            c.wrapS = c.wrapT = THREE.RepeatWrapping
            c.repeat.set(finish.repeat, finish.repeat)
            return c
        }
        return { map: tile(loaded.map), normalMap: tile(loaded.normalMap), roughnessMap: tile(loaded.roughnessMap) }
    },[loaded.map, loaded.normalMap, loaded.roughnessMap, finish.repeat])

    useEffect(()=>()=>Object.values(textures).forEach((t)=>t.dispose()),[textures])

    return <meshStandardMaterial {...textures}/>

}
function SurfaceMaterial({ finish }: { finish: Finish | undefined }) {
  if (finish?.kind === "texture") return <TextureMaterial finish={finish} />
  return <ColorMaterial color={finish?.color ?? "black"} />
}

export default SurfaceMaterial
