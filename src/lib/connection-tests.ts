import { getTypedSettings } from "@/lib/settings";
import { THUMBGEN_USER_AGENT } from "@/lib/user-agent";

export const TESTABLE_PROVIDERS = ["openrouter", "openai", "youtube", "brandfetch"] as const;
export type TestableProvider = (typeof TESTABLE_PROVIDERS)[number];
export type ConnectionTestResult = { ok: boolean; detail: string };

const TIMEOUT_MS = 10_000;

const KEY_FOR: Record<TestableProvider, "openrouterApiKey" | "openaiApiKey" | "youtubeApiKey" | "brandfetchApiKey"> = {
  openrouter: "openrouterApiKey",
  openai: "openaiApiKey",
  youtube: "youtubeApiKey",
  brandfetch: "brandfetchApiKey",
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

async function testBrandfetch(clientId: string, signal: AbortSignal): Promise<ConnectionTestResult> {
  const c = encodeURIComponent(clientId);
  const search = await fetch(`https://api.brandfetch.io/v2/search/brandfetch?c=${c}`, {
    headers: { "User-Agent": THUMBGEN_USER_AGENT },
    signal,
  });
  if (!search.ok) return failure(search, clientId);
  // The search endpoint also answers unknown client IDs (checked 2026-09-16);
  // the logo CDN verifies the ID's signature, so one small icon tells them apart.
  const logo = await fetch(`https://cdn.brandfetch.io/brandfetch.com/w/64/fallback/404/icon.png?c=${c}`, {
    headers: { "User-Agent": THUMBGEN_USER_AGENT },
    redirect: "manual",
    signal,
  });
  if (logo.status === 200) return { ok: true, detail: "Clé valide · recherche et logos disponibles" };
  const reason = logo.headers.get("x-bf-error");
  if (reason === "automated_traffic") {
    return {
      ok: false,
      detail:
        "Recherche disponible, mais Brandfetch refuse l'accès serveur aux logos (automated_traffic) : les logos Brandfetch enregistrés ne pourront pas s'afficher.",
    };
  }
  if (reason) return { ok: false, detail: `Clé refusée par Brandfetch (${reason})` };
  return { ok: false, detail: `Logos Brandfetch : HTTP ${logo.status}` };
}

/** Tests the key the server would actually use (stored value, else env var). */
export async function testProviderKey(provider: TestableProvider): Promise<ConnectionTestResult> {
  const apiKey = getTypedSettings()[KEY_FOR[provider]];
  if (!apiKey) return { ok: false, detail: "Aucune clé configurée" };
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  try {
    if (provider === "openrouter") return await testOpenRouter(apiKey, signal);
    if (provider === "openai") return await testOpenAi(apiKey, signal);
    if (provider === "youtube") return await testYouTube(apiKey, signal);
    return await testBrandfetch(apiKey, signal);
  } catch (err) {
    const name = (err as { name?: unknown } | null)?.name;
    if (name === "TimeoutError" || name === "AbortError") return { ok: false, detail: "Délai dépassé (10 s)" };
    return { ok: false, detail: "Service injoignable" };
  }
}
