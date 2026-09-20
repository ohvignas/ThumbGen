import type { CaptionCue } from "./caption-tracks";

export const HOOK_WINDOW_MS = 30_000;
export const HOOK_MAX_QUOTES = 3;
export const HOOK_QUOTE_MAX_CHARS = 140;

export type HookExtract = { quotes: string[]; hookText: string; cueCount: number };

function clipQuote(text: string): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= HOOK_QUOTE_MAX_CHARS) return compact;
  const slice = compact.slice(0, HOOK_QUOTE_MAX_CHARS - 1);
  const broken = slice.lastIndexOf(" ");
  const base = broken >= 40 ? slice.slice(0, broken) : slice;
  return `${base.trimEnd()}…`;
}

export function extractHook(cues: readonly CaptionCue[]): HookExtract {
  const windowed = cues.filter((cue) => cue.startMs < HOOK_WINDOW_MS && cue.text.trim());
  const joined = windowed
    .map((cue) => cue.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  const parts = joined
    .split(/(?<=[.!?…])\s+/)
    .map((part) => part.replace(/^[«"'\s]+|[»"'\s.!?…]+$/g, "").trim())
    .filter(Boolean);
  const quotes = parts.slice(0, HOOK_MAX_QUOTES).map(clipQuote);
  return { quotes, hookText: quotes.join(" ").trim(), cueCount: windowed.length };
}
