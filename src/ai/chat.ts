import { systemPrompt } from "./systemPrompt";

import { runTool, TOOLS } from "./tools";
import { geminiLimiter } from "../rateLimiter";
export type ChatMessage={
    role:"system"|"user"|"assistant"|"tool";
    content:string
    tool_call_id?: string;
    tool_calls?:{id:string;function :{name:string,arguments:string}
    } []
};
export async function sendMessage(history:ChatMessage[] ,userText:string):Promise<ChatMessage[]> {
    // The system prompt is rebuilt from scratch every call and is NOT kept in
    // history, so it must always carry the FULL scene — a diff would have
    // nothing to apply to.
    const apiMessage:ChatMessage[]=[{role:"system", content:systemPrompt()},...history,{role:"user",content:userText}];
    const tools =TOOLS.map((t)=>({
        type:"function",
        function:{name:t.name,description:t.description,parameters:t.input_schema}
    }));
    // Agent loop: the model may call several tools in turn. Cap iterations so a
    // chatty model can't spin forever and freeze the browser tab.
    const MAX_TURNS = 12;
    console.log("[chat] sendMessage start. history len:", history.length, "userText:", userText);
    for (let turn = 0; turn < MAX_TURNS; turn++) {
        // Refresh the scene each turn so the model sees the edits its own
        // tool calls just made.
        apiMessage[0] = { role: "system", content: systemPrompt() };
        console.log("[chat] turn", turn, "messages in context:", apiMessage.length);

        // Wait if we're hitting rate limits
        await geminiLimiter.throttle();

        const res = await fetch("/api/chat",{
            method:"POST",
            headers:{"Content-Type":"application/json"},
            body:JSON.stringify({messages:apiMessage,tools})

        });
        const message = (await res.json() as ChatMessage)
        // qwen emits `reasoning`, NVIDIA emits `reasoning_content`. Drop either
        // so it isn't echoed into the next turn's context (keeps history clean
        // and avoids sending non-standard fields back to the API).
        const { reasoning: _reasoning, reasoning_content: _reasoningContent, ...clean } = message as Record<string, unknown>;
        apiMessage.push(clean as ChatMessage)
        console.log("[chat] turn", turn, "response role:", message.role, "tool_calls:", message.tool_calls?.length ?? 0);
        if(!message.tool_calls?.length) break
        for(const call of message.tool_calls){
            const args =JSON.parse(call.function.arguments||"{}")
            console.log("[chat] -> tool:", call.function.name, "args:", JSON.stringify(args));
            const result = runTool(call.function.name,args)
            console.log("[chat] <- tool:", call.function.name, "result:", result);

            apiMessage.push({ role: "tool", tool_call_id: call.id, content: result });
            // Yield a frame between tool calls so React can render/commit each
            // edit (and load any GLB) before the next one piles on. This keeps
            // peak GPU/memory pressure low and avoids losing the WebGL context.
            await new Promise((r) => setTimeout(r, 120));
        }

    }

    console.log("[chat] sendMessage done. final history len:", apiMessage.length);
    return apiMessage.slice(1);

}
