import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/lib/db";
import { setSetting } from "@/lib/settings";
import {
  OPENROUTER_CHAT_URL,
  OPENROUTER_RESEARCH_MODEL,
  PERPLEXITY_SONAR_URL,
  RESEARCH_INVALID_KEY,
  RESEARCH_NO_KEY,
  RESEARCH_RATE_LIMIT,
  RESEARCH_RESPONSE_FORMAT,
  fetchPerplexityResearch,
  researchErrorFromHttp,
  researchErrorFromUnknown,
  resolveResearchRoute,
  PerplexityRequestError,
} from "@/lib/research/perplexity-client";

describe("researchErrorFromHttp", () => {
  it("maps 401/403 to the invalid-key French string", () => {
    expect(researchErrorFromHttp(401)).toBe(RESEARCH_INVALID_KEY);
    expect(researchErrorFromHttp(403)).toBe(RESEARCH_INVALID_KEY);
  });

  it("maps 429 to the quota string", () => {
    expect(researchErrorFromHttp(429)).toBe(RESEARCH_RATE_LIMIT);
  });

  it("keeps other statuses visible", () => {
    expect(researchErrorFromHttp(400)).toMatch(/HTTP 400/);
    expect(researchErrorFromHttp(500)).toMatch(/HTTP 500/);
  });
});

describe("researchErrorFromUnknown", () => {
  it("keeps PerplexityRequestError status and body", () => {
    const err = new PerplexityRequestError(401, '{"error":"nope"}', RESEARCH_INVALID_KEY);
    expect(researchErrorFromUnknown(err)).toEqual({
      text: RESEARCH_INVALID_KEY,
      status: 401,
      body: '{"error":"nope"}',
    });
  });

  it("maps an OpenAI-style 401 throw", () => {
    const err = Object.assign(new Error("401 Incorrect API key provided"), { status: 401 });
    expect(researchErrorFromUnknown(err)).toMatchObject({ text: RESEARCH_INVALID_KEY, status: 401 });
  });

  it("keeps the provider on a PerplexityRequestError", () => {
    const err = new PerplexityRequestError(401, "{}", "Clé API OpenRouter invalide. Vérifie-la dans Réglages.", "openrouter");
    expect(researchErrorFromUnknown(err)).toMatchObject({
      text: "Clé API OpenRouter invalide. Vérifie-la dans Réglages.",
      status: 401,
      provider: "openrouter",
    });
  });
});

describe("researchErrorFromHttp provider", () => {
  it("names OpenRouter on 401/429", () => {
    expect(researchErrorFromHttp(401, "openrouter")).toBe("Clé API OpenRouter invalide. Vérifie-la dans Réglages.");
    expect(researchErrorFromHttp(429, "openrouter")).toMatch(/Quota OpenRouter/);
  });
});

const savedPerplexity = process.env.PERPLEXITY_API_KEY;
const savedOpenRouter = process.env.OPENROUTER_API_KEY;

function clearResearchKeys() {
  getDb().prepare("DELETE FROM settings WHERE key = ?").run("perplexityApiKey");
  getDb().prepare("DELETE FROM settings WHERE key = ?").run("openrouterApiKey");
  delete process.env.PERPLEXITY_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
}

function restoreResearchKeys() {
  if (savedPerplexity === undefined) delete process.env.PERPLEXITY_API_KEY;
  else process.env.PERPLEXITY_API_KEY = savedPerplexity;
  if (savedOpenRouter === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = savedOpenRouter;
}

const okCompletion = {
  choices: [{ message: { content: '{"summary":"Ok.","keyPoints":[],"entities":[]}' } }],
};

describe("resolveResearchRoute / fetchPerplexityResearch", () => {
  beforeEach(() => {
    clearResearchKeys();
  });

  afterEach(() => {
    restoreResearchKeys();
  });

  it("prefers native Perplexity when that key is set", () => {
    setSetting("perplexityApiKey", "pplx-key");
    setSetting("openrouterApiKey", "or-key");
    expect(resolveResearchRoute()).toMatchObject({
      provider: "perplexity",
      url: PERPLEXITY_SONAR_URL,
      model: "sonar-pro",
    });
  });

  it("falls back to OpenRouter when only that key is set", () => {
    setSetting("openrouterApiKey", "or-key");
    expect(resolveResearchRoute()).toMatchObject({
      provider: "openrouter",
      url: OPENROUTER_CHAT_URL,
      model: OPENROUTER_RESEARCH_MODEL,
    });
  });

  it("returns null when neither key is set", () => {
    expect(resolveResearchRoute()).toBeNull();
  });

  it("posts api.perplexity.ai /v1/sonar with json_schema when the Perplexity key is set", async () => {
    setSetting("perplexityApiKey", "pplx-key");
    setSetting("openrouterApiKey", "or-also-set");
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(okCompletion), { status: 200 }));
    await fetchPerplexityResearch({ query: "Grok", language: "fr", system: "sys" }, { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(PERPLEXITY_SONAR_URL);
    expect(String(url)).not.toContain("openrouter");
    expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer pplx-key" });
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body.model).toBe("sonar-pro");
    expect(body.language_preference).toBe("fr");
    expect(body.response_format).toEqual(RESEARCH_RESPONSE_FORMAT);
    expect(body.response_format.type).not.toBe("json_object");
  });

  it("posts openrouter.ai chat/completions with perplexity/sonar-pro when only OpenRouter is set", async () => {
    setSetting("openrouterApiKey", "or-key");
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(okCompletion), { status: 200 }));
    await fetchPerplexityResearch({ query: "Grok", language: "fr", system: "sys" }, { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(OPENROUTER_CHAT_URL);
    expect(String(url)).toContain("openrouter.ai");
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: "Bearer or-key",
      "HTTP-Referer": "https://thumbgen.local",
      "X-Title": "ThumbGen",
    });
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body.model).toBe("perplexity/sonar-pro");
    expect(body.language_preference).toBeUndefined();
    expect(body.response_format).toEqual(RESEARCH_RESPONSE_FORMAT);
    expect(body.response_format.type).toBe("json_schema");
    expect(body.response_format.type).not.toBe("json_object");
  });

  it("throws the French missing-key message when neither key is set", async () => {
    const fetchImpl = vi.fn();
    await expect(fetchPerplexityResearch({ query: "Grok", language: "fr", system: "sys" }, { fetchImpl })).rejects.toMatchObject({
      message: RESEARCH_NO_KEY,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
