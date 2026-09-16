import { getTypedSettings } from "@/lib/settings";

export const TESTABLE_PROVIDERS = ["openrouter", "openai", "youtube"] as const;
export type TestableProvider = (typeof TESTABLE_PROVIDERS)[number];
export type ConnectionTestResult = { ok: boolean; detail: string };

const TIMEOUT_MS = 10_000;

const KEY_FOR: Record<TestableProvider, "openrouterApiKey" | "openaiApiKey" | "youtubeApiKey"> = {
  openrouter: "openrouterApiKey",
  openai: "openaiApiKey",
  youtube: "youtubeApiKey",
};

export function isTestableProvider(value: unknown): value is TestableProvider {
  return typeof value === "string" && (TESTABLE_PROVIDERS as readonly string[]).includes(value);
}

function formatUsd(amount: number): string {
  return `${amount.toFixed(2).replace(".", ",")} $`;
}

/** Short provider error message with every occurrence of the key masked. */
async function readErrorMessage(res: Response, apiKey: string): Promise<string> {
  const text = await res.text().catch(() => "");
  let message = "";
  try {
    const body = JSON.parse(text) as { error?: string | { message?: unknown } };
    if (typeof body.error === "string") message = body.error;
    else if (body.error && typeof body.error.message === "string") message = body.error.message;
  } catch {
    message = "";
  }
  return message.split(apiKey).join("…").slice(0, 120);
}

async function failure(res: Response, apiKey: string): Promise<ConnectionTestResult> {
  const message = await readErrorMessage(res, apiKey);
  return { ok: false, detail: message ? `HTTP ${res.status} · ${message}` : `HTTP ${res.status}` };
}

async function testOpenRouter(apiKey: string, signal: AbortSignal): Promise<ConnectionTestResult> {
  const res = await fetch("https://openrouter.ai/api/v1/key", {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal,
  });
  if (!res.ok) return failure(res, apiKey);
  // Documented shape: { data: { usage, limit: number|null, limit_remaining: number|null, is_free_tier, … } }.
  const body = (await res.json().catch(() => ({}))) as {
    data?: { usage?: unknown; limit?: unknown; limit_remaining?: unknown; is_free_tier?: unknown };
  };
  const data = body.data ?? {};
  const parts = ["Clé valide"];
  if (typeof data.usage === "number") parts.push(`consommation ${formatUsd(data.usage)}`);
  if (typeof data.limit === "number") parts.push(`limite ${formatUsd(data.limit)}`);
  else if (data.limit === null) parts.push("sans limite");
  if (typeof data.limit_remaining === "number") parts.push(`reste ${formatUsd(data.limit_remaining)}`);
  if (data.is_free_tier === true) parts.push("offre gratuite");
  return { ok: true, detail: parts.join(" · ") };
}

async function testOpenAi(apiKey: string, signal: AbortSignal): Promise<ConnectionTestResult> {
  const res = await fetch("https://api.openai.com/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal,
  });
  if (!res.ok) return failure(res, apiKey);
  return { ok: true, detail: "Clé valide" };
}

async function testYouTube(apiKey: string, signal: AbortSignal): Promise<ConnectionTestResult> {
  const params = new URLSearchParams({ part: "id", forHandle: "@YouTube", key: apiKey });
  const res = await fetch(`https://www.googleapis.com/youtube/v3/channels?${params.toString()}`, { signal });
  if (!res.ok) return failure(res, apiKey);
  return { ok: true, detail: "Clé valide · 1 unité de quota utilisée" };
}

/** Tests the key the server would actually use (stored value, else env var). */
export async function testProviderKey(provider: TestableProvider): Promise<ConnectionTestResult> {
  const apiKey = getTypedSettings()[KEY_FOR[provider]];
  if (!apiKey) return { ok: false, detail: "Aucune clé configurée" };
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  try {
    if (provider === "openrouter") return await testOpenRouter(apiKey, signal);
    if (provider === "openai") return await testOpenAi(apiKey, signal);
    return await testYouTube(apiKey, signal);
  } catch (err) {
    const name = (err as { name?: unknown } | null)?.name;
    if (name === "TimeoutError" || name === "AbortError") return { ok: false, detail: "Délai dépassé (10 s)" };
    return { ok: false, detail: "Service injoignable" };
  }
}
