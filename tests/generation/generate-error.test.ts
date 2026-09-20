import { describe, it, expect } from "vitest";
import { formatDebugLogDetails } from "@/lib/debug-log-format";
import {
  GENERATION_FAILED_FR,
  generationErrorFields,
  userFacingGenerateError,
} from "@/lib/generation/generate-error";
import {
  isOpenAICreditOrAuthFailure,
  shouldFallbackToOpenRouter,
  userFacingOpenAICreditOrAuthError,
} from "@/lib/generation/openai-native";

describe("userFacingGenerateError", () => {
  it("never returns the mashed English Generationfailed string", () => {
    expect(userFacingGenerateError(new Error("Generation failed"))).toBe(GENERATION_FAILED_FR);
    expect(userFacingGenerateError("Generationfailed")).toBe(GENERATION_FAILED_FR);
    expect(userFacingGenerateError(new Error("Generation failed"))).toContain(" ");
    expect(userFacingGenerateError(undefined)).toBe(GENERATION_FAILED_FR);
  });

  it("keeps the real provider message and redacts keys", () => {
    expect(userFacingGenerateError(new Error("OpenAI API error: 429 — You have no credits remaining"))).toBe(
      "OpenAI API error: 429 — You have no credits remaining",
    );
    expect(userFacingGenerateError(new Error("Bearer sk-abcdefghijklmnopqrstuvwxyz boom"))).toBe(
      "Bearer [redacted] boom",
    );
  });

  it("maps Failed to fetch to a French connection error", () => {
    expect(userFacingGenerateError(new Error("Failed to fetch"))).toBe(
      "Connexion interrompue — réessaie la génération",
    );
    expect(userFacingGenerateError(new TypeError("Failed to fetch"))).toBe(
      "Connexion interrompue — réessaie la génération",
    );
  });

  it("maps Gemini content moderation to a French message", () => {
    expect(
      userFacingGenerateError(
        new Error("OpenRouter API error: 400 — Gemini blocked this request through content moderation."),
      ),
    ).toBe("Requête bloquée par la modération de contenu");
    expect(
      userFacingGenerateError("OpenRouter API error: 400 — Gemini blocked this request through content moderation."),
    ).not.toMatch(/Gemini blocked|content moderation/i);
  });

  it("explains an oversized request body", () => {
    expect(userFacingGenerateError(new Error("Body exceeded 10 MB limit."))).toBe("Payload trop volumineux");
  });

  it("maps a truncated 10MB JSON parse to Payload trop volumineux", () => {
    expect(userFacingGenerateError(new Error("Unterminated string in JSON at position 10458271"))).toBe(
      "Payload trop volumineux",
    );
    expect(userFacingGenerateError(new SyntaxError("Unterminated string in JSON at position 10452319"))).toBe(
      "Payload trop volumineux",
    );
    expect(userFacingGenerateError(new Error("Unexpected token 'n', \"{not-json\" is not valid JSON"))).not.toBe(
      "Payload trop volumineux",
    );
  });

  it("shows error, status and provider in the Logs panel details", () => {
    const text = formatDebugLogDetails({
      error: "Crédits OpenAI épuisés",
      status: 429,
      provider: "openai",
    });
    expect(text).toContain("error Crédits OpenAI épuisés");
    expect(text).toContain("status 429");
    expect(text).toContain("provider openai");
  });

  it("copies status and provider off a job error", () => {
    const err = Object.assign(new Error("OpenAI API error: 429 — You have no credits remaining"), {
      status: 429,
      provider: "openai",
    });
    expect(generationErrorFields(err)).toEqual({
      error: "OpenAI API error: 429 — You have no credits remaining",
      status: 429,
      provider: "openai",
    });
  });
});

describe("OpenAI credit / auth fallback helpers", () => {
  it("treats 429 / 401 / no-credits as fallback-worthy", () => {
    expect(isOpenAICreditOrAuthFailure(429, "You have no credits remaining")).toBe(true);
    expect(isOpenAICreditOrAuthFailure(401, "Incorrect API key")).toBe(true);
    expect(shouldFallbackToOpenRouter({ status: 429, error: "OpenAI API error: 429" })).toBe(true);
    expect(shouldFallbackToOpenRouter({ status: 502, error: "OpenAI API error: fetch failed" })).toBe(true);
    expect(shouldFallbackToOpenRouter({ status: 400, error: "OpenAI API error: 400 — invalid size" })).toBe(false);
  });

  it("returns a French credit or key message", () => {
    expect(userFacingOpenAICreditOrAuthError(429, "You have no credits remaining")).toMatch(/Crédits OpenAI/);
    expect(userFacingOpenAICreditOrAuthError(401, "Invalid API key")).toMatch(/Clé API OpenAI/);
  });
});
