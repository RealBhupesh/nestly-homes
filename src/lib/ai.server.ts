// Server-only OpenAI-compatible chat-completions client used by the AI features.
//
// Provider selection:
//   1. LOVABLE_API_KEY set                → Lovable AI gateway (google/gemini-2.5-flash)
//   2. AI_API_URL + AI_API_KEY (+AI_MODEL) → any OpenAI-compatible endpoint
//      (OpenAI, Google's OpenAI-compat Gemini endpoint, OpenRouter, Groq, ...)
//   3. neither                            → friendly "not configured" error
//
// Upstream error bodies are logged server-side only, never returned to clients.

export const AI_NOT_CONFIGURED = "AI features aren't configured";

interface Provider {
  url: string;
  headers: Record<string, string>;
  model: string;
}

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

function resolveProvider(): Provider {
  const lovable = env("LOVABLE_API_KEY");
  if (lovable) {
    return {
      url: "https://ai.gateway.lovable.dev/v1/chat/completions",
      headers: { "Lovable-API-Key": lovable, Authorization: `Bearer ${lovable}` },
      model: "google/gemini-2.5-flash",
    };
  }
  const base = env("AI_API_URL");
  const key = env("AI_API_KEY");
  if (base && key) {
    const trimmed = base.replace(/\/+$/, "");
    const url = /\/chat\/completions$/.test(trimmed) ? trimmed : `${trimmed}/chat/completions`;
    return {
      url,
      headers: { Authorization: `Bearer ${key}` },
      model: env("AI_MODEL") ?? "gpt-4o-mini",
    };
  }
  throw new Error(AI_NOT_CONFIGURED);
}

export function isAiConfigured(): boolean {
  return Boolean(env("LOVABLE_API_KEY") || (env("AI_API_URL") && env("AI_API_KEY")));
}

export interface ChatRequest {
  messages: Array<{ role: "system" | "user" | "assistant"; content: unknown }>;
  json?: boolean;
  timeoutMs?: number;
}

/** Returns the assistant message text. Throws only user-safe error messages. */
export async function chatCompletion(req: ChatRequest): Promise<string> {
  const provider = resolveProvider();
  let res: Response;
  try {
    res = await fetch(provider.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...provider.headers },
      body: JSON.stringify({
        model: provider.model,
        messages: req.messages,
        ...(req.json ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: AbortSignal.timeout(req.timeoutMs ?? 45_000),
    });
  } catch (err) {
    console.error("[ai] request error:", (err as Error)?.message ?? err);
    throw new Error("AI request failed. Please try again.");
  }
  if (res.status === 429) throw new Error("AI is busy — try again in a minute.");
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 500);
    console.error(`[ai] upstream ${res.status}: ${detail}`);
    if (res.status === 402)
      throw new Error("AI is temporarily unavailable. Please try again later.");
    throw new Error("AI request failed. Please try again.");
  }
  try {
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return json.choices?.[0]?.message?.content ?? "";
  } catch {
    throw new Error("AI request failed. Please try again.");
  }
}

/** Parse a model's JSON reply, tolerating ```json fences. Returns {} on failure. */
export function parseModelJson(raw: string): Record<string, unknown> {
  const tryParse = (s: string) => {
    try {
      const v = JSON.parse(s);
      return v && typeof v === "object" && !Array.isArray(v)
        ? (v as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  };
  const direct = tryParse(raw);
  if (direct) return direct;
  const stripped = raw.replace(/^\s*```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  const fenced = tryParse(stripped);
  if (fenced) return fenced;
  const m = raw.match(/\{[\s\S]*\}/);
  return (m && tryParse(m[0])) || {};
}
