
import { materials } from "./materials";
import { useEditor } from "./store";

function Inspector() {
    const selectedIds = useEditor((s) => s.selectedIds)
    const nodes = useEditor((s) => s.doc.nodes);
    const updateNode = useEditor((s) => s.updateNode)
    const node = nodes[selectedIds[0]]
    if (!node) return null;
    if (node.type === "light")
        return (
            <>
                <input
                    type="range" min={0} max={100}
                    value={node.intensity}
                    onChange={(e) => updateNode(node.id, { intensity: Number(e.target.value) })}>
                </input>
                <input type="color" value ={node.color} onChange={(e)=>updateNode(node.id,{color:e.target.value})}>
                </input>
            </>
        )
    if(node.type ==="wall"){
        return (
            <div>
                {Object.keys(materials).map((key)=>(
                    <button key ={key} onClick={()=>updateNode(node.id,{materialId:key})}>
                        {key}
                    </button>
                )

                )}
            </div>
        )
    }
    if (node.type === "Floor") {
        return (
            <div>
                <label>
                    Material
                    <select
                        value={node.assetId}
                        onChange={(e) => updateNode(node.id, { assetId: e.target.value as "laminate" | "concrete" })}
                    >
                        <option value="laminate">Laminate</option>
                        <option value="concrete">Concrete</option>
                    </select>
                </label>
            </div>
        )
    }
}
export default Inspector;
