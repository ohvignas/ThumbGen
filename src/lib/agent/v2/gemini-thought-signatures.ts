/**
 * Gemini thought signatures (OpenRouter `reasoning_details`) are
 * provider-scoped. Streaming often stores unsigned `reasoning.text` plus
 * `reasoning.encrypted` blobs; the OpenRouter SDK then strips the unsigned
 * entries and replays the leftovers. Google Vertex answers
 * "Requests ending with a model turn are not supported"; Google AI Studio
 * answers "Corrupted thought signature." Omitting the details entirely is the
 * continuation that OpenRouter's own repro found to return 200.
 *
 * Pinning the upstream endpoint stops mid-turn fallback between Vertex and
 * AI Studio, which also invalidates signatures.
 */
export const GEMINI_OPENROUTER_PROVIDER: { order: string[]; allow_fallbacks: boolean } = {
  order: ["Google AI Studio"],
  allow_fallbacks: false,
};

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null;
}

function withoutReasoningDetails(value: Json): Json {
  const providerOptions = value.providerOptions;
  if (!isObject(providerOptions) || !("openrouter" in providerOptions)) return value;
  const openrouter = providerOptions.openrouter;
  if (!isObject(openrouter) || !("reasoning_details" in openrouter)) return value;
  const { reasoning_details: _dropped, ...restOpenrouter } = openrouter;
  const nextOpenrouter = Object.keys(restOpenrouter).length > 0 ? restOpenrouter : undefined;
  const { openrouter: _or, ...restProvider } = providerOptions;
  const nextProviderOptions = nextOpenrouter
    ? { ...restProvider, openrouter: nextOpenrouter }
    : restProvider;
  const next = { ...value };
  if (Object.keys(nextProviderOptions).length > 0) next.providerOptions = nextProviderOptions;
  else delete next.providerOptions;
  return next;
}

function assistantHasPayload(content: unknown): boolean {
  if (typeof content === "string") return content.trim() !== "";
  if (!Array.isArray(content)) return false;
  return content.some((part) => {
    if (!isObject(part)) return false;
    if (part.type === "text" && typeof part.text === "string" && part.text.trim() !== "") return true;
    if (part.type === "tool-call" || part.type === "file") return true;
    return false;
  });
}

function mapParts(content: unknown[]): unknown[] {
  return content.map((part) => (isObject(part) ? withoutReasoningDetails(part) : part));
}

/** Drop reasoning parts and `reasoning_details` so Gemini will accept a tool-call continuation. */
export function omitGeminiThoughtSignatures(messages: unknown[]): unknown[] {
  const out: unknown[] = [];
  for (const message of messages) {
    if (!isObject(message)) {
      out.push(message);
      continue;
    }
    const cleaned = withoutReasoningDetails({ ...message });
    if (Array.isArray(cleaned.content)) {
      const parts =
        cleaned.role === "assistant"
          ? cleaned.content.filter((part) => !(isObject(part) && part.type === "reasoning"))
          : cleaned.content;
      cleaned.content = mapParts(parts);
      if (cleaned.role === "assistant" && !assistantHasPayload(cleaned.content)) continue;
    } else if (cleaned.role === "assistant" && !assistantHasPayload(cleaned.content)) {
      continue;
    }
    out.push(cleaned);
  }
  return out;
}
