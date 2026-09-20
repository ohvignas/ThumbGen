import { getSetting } from "@/lib/settings";
import { YOUTUBE_FETCH_TIMEOUT_MS } from "./api";
import {
  captionLanguagePreference,
  isOfficialCaption,
  json3Url,
  parseJson3Events,
  pickCaptionTrack,
  type CaptionCue,
  type CaptionTrack,
} from "./caption-tracks";
import type { CaptionKind, CaptionStatus } from "./types";

export const CAPTION_CACHE_MS = 24 * 60 * 60 * 1000;
export const INNERTUBE_PLAYER_URL = "https://www.youtube.com/youtubei/v1/player?prettyPrint=false";
export const INNERTUBE_CLIENT_VERSION = "20.10.38";
export const INNERTUBE_USER_AGENT = `com.google.android.youtube/${INNERTUBE_CLIENT_VERSION} (Linux; U; Android 14)`;
const INNERTUBE_HEADERS: [string, string][] = [
  ["Content-Type", "application/json"],
  ["User-Agent", INNERTUBE_USER_AGENT],
];

export type CaptionFetchResult = {
  status: CaptionStatus;
  kind: CaptionKind | null;
  language: string | null;
  cues: CaptionCue[];
};

type CacheEntry = { expiresAt: number; result: CaptionFetchResult };

declare global {
  var __thumbgen_caption_cache: Map<string, CacheEntry> | undefined;
}

function captionCache(): Map<string, CacheEntry> {
  if (!globalThis.__thumbgen_caption_cache) globalThis.__thumbgen_caption_cache = new Map();
  return globalThis.__thumbgen_caption_cache;
}

export function resetCaptionCache(): void {
  globalThis.__thumbgen_caption_cache = new Map();
}

function preferredLangs(): string[] {
  return captionLanguagePreference(getSetting("language") || "fr");
}

async function readJson(url: string, init: RequestInit): Promise<unknown> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(YOUTUBE_FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`caption HTTP ${res.status}`);
  return res.json();
}

function tracksFromPlayer(data: unknown): CaptionTrack[] {
  const raw = (data as { captions?: { playerCaptionsTracklistRenderer?: { captionTracks?: unknown } } }).captions
    ?.playerCaptionsTracklistRenderer?.captionTracks;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as { baseUrl?: unknown; languageCode?: unknown; kind?: unknown; name?: { simpleText?: unknown } };
    if (typeof row.baseUrl !== "string" || typeof row.languageCode !== "string") return [];
    return [
      {
        baseUrl: row.baseUrl,
        languageCode: row.languageCode,
        kind: typeof row.kind === "string" ? row.kind : undefined,
        name: typeof row.name?.simpleText === "string" ? row.name.simpleText : undefined,
      },
    ];
  });
}

async function fetchViaInnerTube(videoId: string, langs: string[]): Promise<CaptionFetchResult | null> {
  const hl = langs[0] ?? "fr";
  const data = await readJson(INNERTUBE_PLAYER_URL, {
    method: "POST",
    headers: INNERTUBE_HEADERS,
    body: JSON.stringify({
      context: { client: { clientName: "ANDROID", clientVersion: INNERTUBE_CLIENT_VERSION, hl, gl: hl === "en" ? "US" : "FR" } },
      videoId,
    }),
  });
  const track = pickCaptionTrack(tracksFromPlayer(data), langs);
  if (!track) return null;
  const timed = await readJson(json3Url(track.baseUrl), { headers: INNERTUBE_HEADERS });
  const cues = parseJson3Events(timed as { events?: Array<{ tStartMs?: number; dDurationMs?: number; segs?: Array<{ utf8?: string }> }> });
  return {
    status: cues.length > 0 ? "ok" : "missing",
    kind: isOfficialCaption(track) ? "official" : "asr",
    language: track.languageCode,
    cues,
  };
}

async function fetchViaLibrary(videoId: string, langs: string[]): Promise<CaptionFetchResult> {
  const { YoutubeTranscript } = await import("youtube-transcript");
  let lastError: unknown;
  for (const lang of [...langs, undefined]) {
    try {
      const rows = await YoutubeTranscript.fetchTranscript(videoId, lang ? { lang } : undefined);
      if (!Array.isArray(rows)) continue;
      const cues = rows
        .map((row) => ({
          startMs: row.offset,
          durationMs: row.duration,
          text: row.text.replace(/\s+/g, " ").trim(),
        }))
        .filter((cue) => cue.text);
      if (cues.length === 0) continue;
      return { status: "ok", kind: "unknown", language: lang ?? null, cues };
    } catch (error) {
      lastError = error;
    }
  }
  const message = lastError instanceof Error ? lastError.message : "";
  if (/disabled|no transcripts|not available|no longer available/i.test(message)) {
    return { status: "missing", kind: null, language: null, cues: [] };
  }
  throw lastError instanceof Error ? lastError : new Error("caption fallback failed");
}

export async function fetchVideoCaptions(videoId: string): Promise<CaptionFetchResult> {
  const langs = preferredLangs();
  const cacheKey = `${videoId}:${langs.join(",")}`;
  const cached = captionCache().get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.result;
  let result: CaptionFetchResult;
  try {
    result = (await fetchViaInnerTube(videoId, langs)) ?? (await fetchViaLibrary(videoId, langs));
  } catch {
    try {
      result = await fetchViaLibrary(videoId, langs);
    } catch {
      result = { status: "blocked", kind: null, language: null, cues: [] };
    }
  }
  captionCache().set(cacheKey, { expiresAt: Date.now() + CAPTION_CACHE_MS, result });
  return result;
}
