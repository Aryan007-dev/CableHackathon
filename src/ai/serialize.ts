import { useEditor } from "../store";

export function serializeScene():string{
    const state= useEditor.getState();
    const allNodes = Object.values(state.doc.nodes)
    const lines=allNodes.map((n)=>{
        if(n.type==="wall"){
            return`id:${n.id} type:${n.type} start:${n.start} end:${n.end} position:${n.transform.position} rotation:${n.transform.rotation} material:${n.materialId}`
        }
        if(n.type==="furniture"){
            return`id:${n.id} type:${n.type} assetId:${n.assetId} position:${n.transform.position} rotation:${n.transform.rotation}`
        }
        if(n.type ==="light"){
            return `id:${n.id} type:${n.type} color:${n.color} intensity:${n.intensity} position:${n.transform.position} `
        }
        return `id:${n.id} type:${n.type}`;

    })
    return lines.join("\n")
}