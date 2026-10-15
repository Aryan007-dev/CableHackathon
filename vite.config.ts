import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { resplanPlugin } from "./scripts/resplan/vitePlugin.ts";

// Chat model is served through an OpenAI-compatible endpoint.
// Provider is selected using CHAT_PROVIDER.
//
// Supported providers:
//   CHAT_PROVIDER=gemini
//   CHAT_PROVIDER=groq
//   CHAT_PROVIDER=nvidia
//   CHAT_PROVIDER=agentrouter
//   CHAT_PROVIDER=atria
//
// Atria:
//   ATRIA_API_KEY
//   ATRIA_MODEL
//   default model: Atria-Dawn-Preview

const PROVIDERS = {
  gemini: {
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
    key: "GEMINI_API_KEY",
    model: "gemini-3.5-flash",
    modelEnv: "GEMINI_MODEL",
    thinking: false,
  },

  groq: {
    baseURL: "https://api.groq.com/openai/v1",
    key: "GROQ_API_KEY",
    model: "openai/gpt-oss-120b",
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

export default defineConfig(({ mode }) => {
  // Load .env / .env.local from the project root.
  const env = loadEnv(mode, process.cwd(), "");

  // Choose provider.
  // For testing Atria, your .env should contain:
  //
  // CHAT_PROVIDER=atria
  //
  const providerName =
    (env.CHAT_PROVIDER || "gemini") as keyof typeof PROVIDERS;

  // Don't silently fall back to Gemini if the provider name is invalid.
  const PROV = PROVIDERS[providerName];

  if (!PROV) {
    throw new Error(
      `Unknown CHAT_PROVIDER "${providerName}". ` +
        `Valid providers: ${Object.keys(PROVIDERS).join(", ")}`
    );
  }

  // Get API key.
  const apiKey = env[PROV.key];

  // Get model from environment or use provider default.
  const MODEL = env[PROV.modelEnv] || PROV.model;

  // Whether this provider needs special thinking parameters.
  const thinking = PROV.thinking;

  // Debug information.
  console.log("==========================================");
  console.log("[proxy] CHAT_PROVIDER:", env.CHAT_PROVIDER);
  console.log("[proxy] PROVIDER:", providerName);
  console.log("[proxy] MODEL:", MODEL);
  console.log("[proxy] BASE URL:", PROV.baseURL);
  console.log("[proxy] API KEY:", apiKey ? "✓ loaded" : "✗ missing");
  console.log("==========================================");

  if (!apiKey) {
    console.warn(
      `[proxy] WARNING: ${PROV.key} is not set in .env — AI calls will fail.`
    );
  }

  return {
    plugins: [
      react(),
      resplanPlugin(),

      {
        name: "ai-chat-proxy",

        configureServer(server: any) {
          server.middlewares.use(
            "/api/chat",
            async (req: any, res: any) => {
              // Only accept POST requests.
              if (req.method !== "POST") {
                res.statusCode = 405;
                res.end("Method Not Allowed");
                return;
              }

              // Read request body.
              let body = "";

              req.on("data", (chunk: Buffer) => {
                body += chunk;
              });

              req.on("end", async () => {
                try {
                  const { messages, tools } = JSON.parse(body);

                  console.log(
                    `[proxy][${providerName}] inbound messages:`,
                    messages?.length ?? 0,
                    "tools:",
                    tools?.length ?? 0
                  );

                  // OpenAI-compatible payload.
                  const payload: Record<string, unknown> = {
                    model: MODEL,
                    messages,
                    tools,
                    temperature: 1,
                    top_p: 0.95,
                    max_tokens: 16384,
                  };

                  // Only providers that explicitly require thinking
                  // receive these parameters.
                  //
                  // Currently NVIDIA has thinking=true.
                  // Atria has thinking=false.
                  if (thinking) {
                    payload.chat_template_kwargs = {
                      thinking: true,
                      reasoning_effort: "high",
                    };
                  }

                  const url = `${PROV.baseURL}/chat/completions`;

                  console.log(
                    `[proxy][${providerName}] calling model`,
                    MODEL
                  );

                  console.log(
                    `[proxy][${providerName}] URL`,
                    url
                  );

                  const t0 = Date.now();

                  // Call provider.
                  const r = await fetch(url, {
                    method: "POST",

                    headers: {
                      Authorization: `Bearer ${apiKey}`,
                      "Content-Type": "application/json",
                    },

                    body: JSON.stringify(payload),
                  });

                  // Handle provider errors.
                  if (!r.ok) {
                    const text = await r.text();

                    throw new Error(
                      `${providerName} HTTP ${r.status}: ${text}`
                    );
                  }

                  // Parse OpenAI-compatible response.
                  const data = (await r.json()) as {
                    choices: {
                      message: any;
                    }[];
                  };

                  const msg = data.choices?.[0]?.message;

                  if (!msg) {
                    throw new Error(
                      `${providerName} returned no message in choices[0].`
                    );
                  }

                  // Extract tool names for debugging.
                  const toolNames = (msg.tool_calls ?? [])
                    .filter(
                      (t: any) => t.type === "function"
                    )
                    .map(
                      (t: any) => t.function?.name
                    );

                  console.log(
                    `[proxy][${providerName}] replied in`,
                    Date.now() - t0,
                    "ms.",
                    "tool_calls:",
                    toolNames
                  );

                  // Send the OpenAI-compatible message back
                  // to your frontend.
                  res.setHeader(
                    "Content-Type",
                    "application/json"
                  );

                  res.end(JSON.stringify(msg));
                } catch (err) {
                  console.error(
                    `[proxy][${providerName}] MODEL CALL FAILED:`,
                    err
                  );

                  res.statusCode = 200;

                  res.setHeader(
                    "Content-Type",
                    "application/json"
                  );

                  res.end(
                    JSON.stringify({
                      role: "assistant",
                      content: `Assistant error: ${String(err)}`,
                    })
                  );
                }
              });
            }
          );
        },
      },
    ],
  };
});