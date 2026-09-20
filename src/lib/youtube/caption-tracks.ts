export const CAPTION_LANG_FALLBACKS = ["fr", "en"] as const;

export type CaptionTrack = {
  baseUrl: string;
  languageCode: string;
  kind?: string;
  name?: string;
};

export type CaptionCue = { startMs: number; durationMs: number; text: string };

export function captionLanguagePreference(uiLanguage: string): string[] {
  const primary = uiLanguage.trim().toLowerCase().slice(0, 2);
  const ordered = primary.length === 2 ? [primary, ...CAPTION_LANG_FALLBACKS] : [...CAPTION_LANG_FALLBACKS];
  return [...new Set(ordered)];
}

export function isOfficialCaption(track: CaptionTrack): boolean {
  return track.kind !== "asr";
}

function langRank(languageCode: string, preferred: readonly string[]): number {
  const lower = languageCode.trim().toLowerCase();
  const index = preferred.findIndex((code) => lower === code || lower.startsWith(`${code}-`));
  return index === -1 ? 99 : index;
}

export function pickCaptionTrack(tracks: readonly CaptionTrack[], preferred: readonly string[]): CaptionTrack | null {
  if (tracks.length === 0) return null;
  return [...tracks].sort((left, right) => {
    const official = Number(isOfficialCaption(right)) - Number(isOfficialCaption(left));
    if (official !== 0) return official;
    const byLang = langRank(left.languageCode, preferred) - langRank(right.languageCode, preferred);
    if (byLang !== 0) return byLang;
    return 0;
  })[0]!;
}

export function json3Url(baseUrl: string): string {
  const url = new URL(baseUrl);
  url.searchParams.delete("fmt");
  url.searchParams.set("fmt", "json3");
  return url.toString();
}

type Json3Seg = { utf8?: string };
type Json3Event = { tStartMs?: number; dDurationMs?: number; segs?: Json3Seg[] };

export function parseJson3Events(body: { events?: Json3Event[] }): CaptionCue[] {
  const cues: CaptionCue[] = [];
  for (const event of body.events ?? []) {
    if (!event.segs?.length) continue;
    const text = event.segs
      .map((seg) => (seg.utf8 ?? "").replace(/\s+/g, " "))
      .join("")
      .replace(/\s+/g, " ")
      .trim();
    if (!text) continue;
    cues.push({
      startMs: typeof event.tStartMs === "number" ? event.tStartMs : 0,
      durationMs: typeof event.dDurationMs === "number" ? event.dDurationMs : 0,
      text,
    });
  }
  return cues;
}
