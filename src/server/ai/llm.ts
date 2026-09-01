export type SupportedAiProvider = "OPENAI" | "ANTHROPIC" | "OPENAI_COMPATIBLE";

export interface LlmConfig {
  provider: SupportedAiProvider;
  apiKey: string;
  model: string;
  baseUrl?: string | null;
}

const DEFAULT_MODEL: Record<SupportedAiProvider, string> = {
  OPENAI: "gpt-4o-mini",
  ANTHROPIC: "claude-sonnet-5",
  OPENAI_COMPATIBLE: "",
};

const REQUEST_TIMEOUT_MS = 15_000;
const MAX_ERROR_BODY_CHARS = 300;

// Cloud metadata endpoints that hand out credentials to whatever can reach
// them over plain HTTP. A user-supplied "OpenAI-compatible" base URL is
// otherwise deliberately unrestricted (local Ollama/LM Studio on localhost
// or a LAN host is the whole point of this field), so this is a narrow
// blocklist rather than a private-IP ban.
const BLOCKED_HOSTS = new Set([
  "169.254.169.254", // AWS/Azure/DO metadata
  "metadata.google.internal",
  "100.100.100.200", // Alibaba Cloud metadata
  "[fd00:ec2::254]",
]);

function assertSafeBaseUrl(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Invalid base URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Base URL must be http(s).");
  }
  if (BLOCKED_HOSTS.has(url.hostname)) {
    throw new Error("This base URL is not allowed.");
  }
  return url;
}

async function errorBody(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  return text.slice(0, MAX_ERROR_BODY_CHARS);
}

export async function completeChat(config: LlmConfig, system: string, user: string): Promise<string> {
  const model = config.model || DEFAULT_MODEL[config.provider];
  const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);

  if (config.provider === "OPENAI") {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.4,
      }),
      signal,
    });
    if (!res.ok) throw new Error(`OpenAI error (${res.status}): ${await errorBody(res)}`);
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return json.choices?.[0]?.message?.content ?? "";
  }

  if (config.provider === "ANTHROPIC") {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": config.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        system,
        messages: [{ role: "user", content: user }],
      }),
      signal,
    });
    if (!res.ok) throw new Error(`Anthropic error (${res.status}): ${await errorBody(res)}`);
    const json = (await res.json()) as { content?: { text?: string }[] };
    return json.content?.[0]?.text ?? "";
  }

  // OPENAI_COMPATIBLE: any provider (Groq, Together, local Ollama/LM Studio, etc.)
  // that implements the OpenAI chat-completions request/response shape.
  if (!config.baseUrl) {
    throw new Error("A base URL is required for a custom OpenAI-compatible provider.");
  }
  assertSafeBaseUrl(config.baseUrl);
  const res = await fetch(`${config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.4,
    }),
    signal,
  });
  if (!res.ok) throw new Error(`Provider error (${res.status}): ${await errorBody(res)}`);
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return json.choices?.[0]?.message?.content ?? "";
}
