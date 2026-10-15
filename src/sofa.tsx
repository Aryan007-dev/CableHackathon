import { useGLTF } from "@react-three/drei";
function Sofa(){
    const banana =useGLTF("/sofa.glb")
    return <primitive object ={banana.scene}/>
}
export default Sofa