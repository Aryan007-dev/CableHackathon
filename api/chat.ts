// Vercel serverless function: /api/chat
// Mirrors the dev proxy in vite.config.ts. Provider picked by CHAT_PROVIDER.
export const maxDuration = 60;

const PROVIDERS = {
  gemini: {
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
    key: "GEMINI_API_KEY",
    model: "gemini-3-flash-preview",
    modelEnv: "GEMINI_MODEL",
    thinking: false,
  },
  groq: {
    baseURL: "https://api.groq.com/openai/v1",
    key: "GROQ_API_KEY",
    model: "llama-3.1-70b-versatile",
    modelEnv: "GROQ_MODEL",
    thinking: false,
  },
  nvidia: {
    baseURL: "https://integrate.api.nvidia.com/v1",
    key: "NVIDIA_API_KEY",
    model: "deepseek-ai/deepseek-v4-flash",
    modelEnv: "NVIDIA_MODEL",
    thinking: true,
  },
  aimlapi: {
    baseURL: "https://api.aimlapi.com/v1",
    key: "AIMLAPI_API_KEY",
    model: "inclusionai/ling-3.0-tiny",
    modelEnv: "AIMLAPI_MODEL",
    thinking: false,
  },
  agentrouter: {
    baseURL: "https://co.agentrouter.org/v1",
    key: "AGENTROUTER_API_KEY",
    model: "deepseek-v4-flash",
    modelEnv: "AGENTROUTER_MODEL",
    thinking: false,

  },
  atria: {
    baseURL: "https://api.atria-asi.ai/v1",
    key: "ATRIA_API_KEY",
    model: "Atria-Dawn-Preview",
    modelEnv: "ATRIA_MODEL",
    thinking: false,
  },
  inception:{
    baseURL:"https://api.inceptionlabs.ai/v1",
    key:"INCEPTION_API_KEY",
    model:"mercury-2.5",
    modelEnv:"INCEPTION_MODEL",
    thinking:false
  }


} as const;

// Only signed-in users may spend the AI key: the browser sends its Supabase
// session token, and Supabase confirms it. Without the Supabase settings
// nobody gets through (fail closed).
async function signedIn(req: any): Promise<boolean> {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const auth = req.headers?.authorization;
  if (!url || !anon || typeof auth !== "string" || !auth.startsWith("Bearer ")) return false;
  try {
    const r = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anon, Authorization: auth } });
    return r.ok;
  } catch {
    return false;
  }
}

const MAX_BODY = 1_000_000; // bytes: a long chat with the full scene stays far below this

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.end("Method Not Allowed");
    return;
  }
  if (!(await signedIn(req))) {
    res.statusCode = 401;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ role: "assistant", content: "Please sign in to use the assistant." }));
    return;
  }

  let body = "";
  req.on("data", (chunk: Buffer) => {
    body += chunk;
    if (body.length > MAX_BODY) req.destroy();
  });
  req.on("end", async () => {
    try {
      const { messages, tools } = JSON.parse(body);

      const providerName = "inception";

      const PROV = PROVIDERS.inception

      const apiKey = process.env[PROV.key];
      const MODEL = process.env[PROV.modelEnv] || PROV.model;
      console.log("🔥 USING PROVIDER:", providerName);
      console.log("🔥 MODEL:", MODEL);
      console.log("🔥 URL:", `${PROV.baseURL}/chat/completions`);
      if (!apiKey) {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ role: "assistant", content: "Assistant error: missing API key env var." }));
        return;
      }

      const payload: Record<string, unknown> = {
        model: MODEL,
        messages,
        tools,
        temperature: 1,
        top_p: 0.95,
        max_tokens: 16384,
      };
      if (PROV.thinking) payload.chat_template_kwargs = { thinking: true, reasoning_effort: "high" };

      const r = await fetch(`${PROV.baseURL}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!r.ok) {
        const text = await r.text();
        throw new Error(`${providerName} HTTP ${r.status}: ${text}`);
      }

      const data = await r.json() as { choices: { message: any }[] };
      const msg = data.choices[0].message;

      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(msg));
    } catch (err) {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ role: "assistant", content: `Assistant error: ${String(err)}` }));
    }
  });
}