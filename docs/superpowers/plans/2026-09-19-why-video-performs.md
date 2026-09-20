# Why a followed video performs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On a followed-video thumbnail click, show an honest « Pourquoi ça performe » panel: code-owned ×N (and optional snapshot velocity), public-caption hook quotes from the first ~30s, then a TypeSafe Jev Score / Noul / Choice on title+hook — never invented Studio CTR or retention.

**Architecture:** A on-demand `GET /api/channels/videos/[videoId]/why` loads the followed row + channel median + optional `video_stat_snapshots` pair (consume only; do not respec the poller). Code fetches public caption tracks via InnerTube ANDROID `youtubei/v1/player` then official timedtext `fmt=json3` (ASR fallback, then existing `youtube-transcript`). Code extracts hook quotes. Jev judges packaging only after those facts exist. `VideoInfoDialog` renders the section. No Whisper, no yt-dlp, no full-transcript persist.

**Tech Stack:** Next.js App Router (Node runtime), existing `youtube-transcript` ^1.3 (fallback only), TypeSafe `evaluateSystemOne` (`jev-latest`), Vitest 4, no new npm dependencies.

## Global Constraints

- Work in `/Users/antoinevigneau/thumbgen-real` (main repo). Do **not** create a git worktree. Do **not** start a new branch.
- Do **not** commit unless the human later asks. Each task still lists a `git commit` step (skill requirement) — **skip it when executing**.
- Do **not** push, merge, or open a PR. Do **not** run finishing-a-development-branch.
- Do **not** touch `data/thumbgen.db` or any live user data. Tests use `tests/setup.ts` (`THUMBGEN_DB_PATH` temp file). Every test that writes channel rows starts with `getDb().exec("DELETE FROM followed_channels")` (videos and snapshots cascade).
- Do **not** call paid APIs (OpenRouter, Perplexity, TypeSafe, image models) or the live YouTube Data API / InnerTube / timedtext. Caption tests stub `fetch`. TypeSafe tests stub `fetch` like `tests/typesafe/rerank-titles.test.ts`.
- Tests: `./node_modules/.bin/vitest run <file>` (no `npx`). Node: `/opt/homebrew/bin/node` if `node` is missing. Types: `./node_modules/.bin/tsc --noEmit`.
- TypeSafe Jev is **not** a YouTube stats API, **not** a calculator, **not** a transcript fetcher. Read `.cursor/skills/typesafe-ai/SKILL.md` and https://docs.typesafe.ai/api.md. **CODE** computes ×N (`performanceScore` / `videoPerformance`), optional snapshot VPH (`resolveViewsPerHour` in `working-subject.ts`), format (`classifyVideoFormat`), and hook quotes. **Jev Score** grades click/hold packaging of title+hook. **Jev Noul** is P(spoken opening would hold past 30s). **Jev Choice** picks one closed packaging category. Never send raw view piles and ask Jev for CTR or ×N. Missing key / failure → no Jev block; facts + quotes still show. No live TypeSafe calls in tests or from this agent.
- YouTube Data API `captions.list` / `captions.download` are **out**: OAuth, typically owner-only, 50 quota units to list, cannot read other people’s tracks. Do not add those methods to `src/lib/youtube/api.ts`.
- Forbidden: yt-dlp, Whisper-on-download (Task 8 only, not this session), Invidious, Piped, Social Blade, Viewstats, vidIQ APIs, any third-party scrape host, `innertube-sdk` as a new dependency.
- Do **not** edit `docs/superpowers/plans/2026-09-19-followed-video-snapshots.md`. This plan **consumes** `latestSnapshotPairs` / `resolveViewsPerHour` when rows exist and stays silent when they do not. Do not add RSS, WebSub, or poller code here.
- Do **not** refactor `extract_youtube_script` / `youtube-transcript` in the agent. Chat keep using the existing tool.
- UI copy is French; JSX apostrophes as `&apos;`. `cn` from `"cn"`. Never display the words CTR, impressions, AVD, RPM, or a fake rétention % as if we had Studio. The disclaimer may name those metrics only to say we do **not** have them.
- Docker: when the UI must show on http://localhost:3000, `docker compose up -d --build` from `/Users/antoinevigneau/thumbgen-real` (never a worktree). Browser-verify by opening a followed thumbnail — do not click « Actualiser » / « Tout actualiser ».

---

## Deepened facts (research 2026-09-19)

### What public data can honestly say

ThumbGen already has, for followed videos: views, likes, age, channel median, local format, optional 30-day snapshots (`video_stat_snapshots` + `latestSnapshotPairs`). ×N = `views ÷ median` (`src/lib/youtube/performance.ts`, bands ≥×3 / ×0,5–×3 / <×0,5). Recent (<7 d) videos are `kind: "recent"` (vues/j), not a fake ×N. Tendance already attaches `overperformance`, `viewsPerHour`, `velocityKind` (`delta` only when two snapshots exist).

Without Studio we **cannot** know: impressions, CTR, average view duration, retention curve, traffic sources, RPM, A/B tests. Academic and industry work that “predicts CTR” from thumbnails almost always uses **views** (or view-through) as a proxy — not owner Analytics.

Honest public extras we are **not** shipping in v1: YouTube Most Replayed heatmap (InnerTube `/next` markers — replay intensity, not Studio retention). OSS: `reckerp/yt-most-replayed`, `yunesco/innertube-sdk`. Later only (Task 8).

### Transcripts of other people’s videos

| Path | Cost | ToS / auth | FR/EN | Verdict |
|---|---|---|---|---|
| Data API `captions.list` + `download` | 50 units to list; download OAuth | Owner / partner scopes. Not for swipe-file competitors. | Yes if owner uploaded them | **No** |
| InnerTube `POST /youtubei/v1/player` ANDROID → `captionTracks[].baseUrl` → `/api/timedtext?fmt=json3` | $0, unofficial | Same family as the in-player transcript. WEB client often needs PO tokens; ANDROID is the 2025–2026 workaround (`jdepoix/youtube-transcript-api`, `Kakulukian/youtube-transcript` 1.3). Datacenter IPs get blocked. YouTube ToS § automated access is grey — we only fetch the public caption file the player already loads, one video on user click. | Pick `fr` then `en` (prefix match `fr-FR` / `en-US`). Official = no `kind` or `kind !== "asr"`; ASR = `kind: "asr"`. | **v1 primary** |
| `youtube-transcript` ^1.3 (already in `package.json`) | $0 | InnerTube ANDROID then watch-page scrape. First track if no `lang`. | Pass `{ lang: "fr" }` then `"en"`. | **v1 fallback** |
| yt-dlp `--write-auto-sub --skip-download` | $0 | ToS-hostile (automation / download). Snapshots plan already forbids it. | Yes | **No** |
| Whisper on downloaded audio | Paid or heavy local | Downloads media. ToS + CPU. | Yes | **Not v1** (Task 8) |

Prefer **official timedtext** over ASR. Do not persist the full transcript (ToS / Non-Authorized Data). Cache the parsed fetch result in-process for 24 h only.

### OSS / papers / products that “explain why it performed”

**Prefer (honest, free, close to our job)**

1. **[AlekseiUL/youtube-breakout-analyzer](https://github.com/AlekseiUL/youtube-breakout-analyzer)** — CLI: channel-relative outliers, explicit “this is not a virality predictor; no CTR/retention”. Pixel brightness/contrast only. **Honesty model to copy.**
2. **[tabato/viral-ops](https://github.com/tabato/viral-ops)** — `views ÷ channel average` (same ×N idea as vidIQ / 1of10 / our `performanceScore`) + generative “why it went viral” + swipe markdown. Closest **product** analog; we replace the LLM essay with typed Jev + quotes.
3. **[phillipmex/yt-outlier-mcp](https://github.com/phillipmex/yt-outlier-mcp)** — outlier vs channel median + InnerTube ANDROID transcript (graceful `null`). Transcript path to copy; MCP server not to vendor.
4. **[lennoxsaint/ai-content-forensics](https://github.com/lennoxsaint/ai-content-forensics)** — Claude skill: titles / thumbs / hooks / constitutions on a whole catalog. Pattern library, not a runtime we can import.
5. **[KevinG1456/viralscopes.io](https://github.com/KevinG1456/viralscopes.io)** — “Viral Score”, predicted thumbnail CTR, hook class. Useful as a **negative** example: do not invent a 0–100 virality CTR.

**Commercial (not OSS, not free, not Studio-honest):** Viewstats (MrBeast-adjacent outliers), vidIQ, TubeBuddy, 1of10 / OutlierKit. They sell packaging/outlier UX; they do not give us other people’s CTR.

**Academic (views ≠ CTR):** *Who wants to be a Click-Millionaire?* (ICPR 2022, Youtube-Science-Channels, thumbs + captions → views); Roy / DSS 2022 thumbnail visual attributes → view-through; *Engagement dynamics…* (arXiv:1611.00687) meta features vs views. Clickbait papers (Gothankar et al.) correlate bait language with views, not impressions. **Red-Means-Go** (GitHub) is a Fortnite thumbnail/views pipeline.

**Reco for ThumbGen:** do not vendor those repos. Implement the breakout-analyzer honesty + viral-ops ×N + yt-outlier-mcp caption path, with Jev as a judge **after** code has ×N and hook quotes.

### TypeSafe role (locked)

Jev already: `jevClickNouls` (search/followed titles), `jevTrendJudgments` (Tendance Choice format + Score note). This feature is a **third** call, per clicked video, not a ranker.

State fields: `title`, `descriptionExcerpt`, `hookText`, `hookQuotes`, `captionKind`, `language`, `overperformance` (already computed or null), `performanceKind`, `viewsPerHour`, `velocityKind`. No thumbnail URL, no pixels, no raw view arrays.

One `evaluateSystemOne` with three questions (`click` Score, `hold` Noul, `category` Choice). Display note = `(clamp(score,0,4) / 4) * 10` like Tendance. Jev does not generate a paragraph — the UI assembles labels from typed answers.

### Current UI

`VideoCard` / Tendance `WorkingThumb` click → `FollowedChannelsSection` `infoVideo` → `VideoInfoDialog` (cote ×N, format, excerpt, YouTube, référence). Search hits do **not** open this dialog — **out of scope**.

---

## Design rulings (locked)

| Decision | Ruling |
|---|---|
| Surface | Followed `VideoInfoDialog` only (grid + Tendance tiles). Not search, not agent. |
| Route | `GET /api/channels/videos/[videoId]/why`. 404 if the id is not in `channel_videos`. 200 with degraded captions/Jev otherwise. |
| Captions | InnerTube ANDROID player → pick track → timedtext `fmt=json3`. Prefer official over ASR, then `settings.language` (default `fr`) then `en`. Fallback: `YoutubeTranscript.fetchTranscript(id, { lang })`. |
| Hook | Cues with `startMs < 30_000`. Max 3 quotes, each ≤140 chars. Code only. |
| Cache | `globalThis.__thumbgen_caption_cache` 24 h, hook+cues not a SQLite transcript dump. `resetCaptionCache()` for tests. |
| Snapshots | If `latestSnapshotPairs` has `previous`, `velocityKind = "delta"` and VPH = Δviews/Δhours via existing `resolveViewsPerHour`. Else `"average"` or omit climb wording. Never say « ça grimpe » without `delta`. |
| Jev | After facts+hook. Failure / no key → `jev.used = false`. Local format chip stays as today. |
| Category | New closed set `WHY_CATEGORIES` (packaging why), **not** `VIDEO_FORMATS` (Tendance already Choices format). |
| Copy | Heading `Pourquoi ça performe`. Disclaimer always. No fake Studio numbers. |
| Whisper / heatmap | Task 8. Do not implement this session. |
| Deps | No new packages. |

---

## File Structure

**Create**

- `src/lib/youtube/caption-tracks.ts` — track ranking, JSON3 parse, language preference (pure).
- `src/lib/youtube/hook-extract.ts` — first-30s quotes (pure).
- `src/lib/youtube/why-categories.ts` — packaging category ids/labels + hold bands (client-safe).
- `src/lib/youtube/captions.ts` — InnerTube + timedtext + youtube-transcript fallback + 24 h cache (Node).
- `src/lib/youtube/why-performance.ts` — `buildWhyFacts`, `composeWhyVideo`.
- `src/lib/typesafe/why-package.ts` — `jevWhyPackage`.
- `src/app/api/channels/videos/[videoId]/why/route.ts` — GET.
- `src/components/library/followed-channels/WhyPerformanceSection.tsx` — dialog body.
- Tests: `tests/channels/caption-tracks.test.ts`, `tests/channels/hook-extract.test.ts`, `tests/channels/why-categories.test.ts`, `tests/channels/why-performance.test.ts`, `tests/channels/captions.test.ts`, `tests/typesafe/why-package.test.ts`, `tests/channels/why-route.test.ts`.

**Modify**

- `src/lib/youtube/types.ts` — `WhyVideoResponse` and related aliases.
- `src/components/library/followed-channels/api.ts` — `why(videoId)`.
- `src/components/library/followed-channels/view.ts` — hold / caption / disclaimer copy helpers.
- `src/components/library/followed-channels/VideoInfoDialog.tsx` — mount the section; scrollable dialog.
- `tests/library/followed-themes-ui.test.tsx` — mock `why`, assert new copy.
- `tests/channels/view.test.ts` — new formatters.
- `tests/channels/videos-routes.test.ts` — optional 404 smoke if not covered in `why-route.test.ts` (prefer the dedicated file).

**Unchanged on purpose:** snapshot poller / RSS / `stat-snapshots.ts` writers, `working-subject.ts` ranking, `jevTrendJudgments`, `extract-youtube-script.ts`, `data/thumbgen.db`, YouTube Data API client.

**Later only (Task 8):** Whisper if `captions.status === "missing"`; Most Replayed heatmap as a retention **proxy** with an honesty line.

---

## Chunk 1: Pure caption + hook + facts

### Task 1: Caption track picker and JSON3 parser

**Files:**
- Create: `src/lib/youtube/caption-tracks.ts`
- Test: `tests/channels/caption-tracks.test.ts`

**Interfaces:**
- Consumes: nothing from later tasks.
- Produces: `CaptionTrack`, `CaptionCue`, `CAPTION_LANG_FALLBACKS`, `captionLanguagePreference`, `pickCaptionTrack`, `json3Url`, `parseJson3Events`.

- [ ] **Step 1: Write the failing test**

Create `tests/channels/caption-tracks.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  captionLanguagePreference,
  json3Url,
  parseJson3Events,
  pickCaptionTrack,
  type CaptionTrack,
} from "@/lib/youtube/caption-tracks";

const track = (partial: Partial<CaptionTrack> & Pick<CaptionTrack, "baseUrl" | "languageCode">): CaptionTrack => ({
  kind: partial.kind,
  name: partial.name,
  baseUrl: partial.baseUrl,
  languageCode: partial.languageCode,
});

describe("captionLanguagePreference", () => {
  it("puts the UI language first, then fr and en without duplicates", () => {
    expect(captionLanguagePreference("fr")).toEqual(["fr", "en"]);
    expect(captionLanguagePreference("en")).toEqual(["en", "fr"]);
    expect(captionLanguagePreference("es")).toEqual(["es", "fr", "en"]);
  });
});

describe("pickCaptionTrack", () => {
  const officialFr = track({ baseUrl: "https://www.youtube.com/api/timedtext?v=a&lang=fr", languageCode: "fr-FR" });
  const asrFr = track({ baseUrl: "https://www.youtube.com/api/timedtext?v=a&lang=fr&kind=asr", languageCode: "fr", kind: "asr" });
  const officialEn = track({ baseUrl: "https://www.youtube.com/api/timedtext?v=a&lang=en", languageCode: "en" });
  const asrEn = track({ baseUrl: "https://www.youtube.com/api/timedtext?v=a&lang=en&kind=asr", languageCode: "en-US", kind: "asr" });

  it("prefers official fr over official en over ASR fr over ASR en", () => {
    expect(pickCaptionTrack([asrEn, asrFr, officialEn, officialFr], ["fr", "en"])).toEqual(officialFr);
    expect(pickCaptionTrack([asrEn, asrFr, officialEn], ["fr", "en"])).toEqual(officialEn);
    expect(pickCaptionTrack([asrEn, asrFr], ["fr", "en"])).toEqual(asrFr);
    expect(pickCaptionTrack([asrEn], ["fr", "en"])).toEqual(asrEn);
  });

  it("returns null when there are no tracks", () => {
    expect(pickCaptionTrack([], ["fr", "en"])).toBeNull();
  });
});

describe("json3Url", () => {
  it("strips an existing fmt and appends fmt=json3", () => {
    expect(json3Url("https://www.youtube.com/api/timedtext?v=a&fmt=srv3&lang=fr")).toBe(
      "https://www.youtube.com/api/timedtext?v=a&lang=fr&fmt=json3",
    );
    expect(json3Url("https://www.youtube.com/api/timedtext?v=a&lang=en")).toBe(
      "https://www.youtube.com/api/timedtext?v=a&lang=en&fmt=json3",
    );
  });
});

describe("parseJson3Events", () => {
  it("joins segs and skips style-only events", () => {
    const cues = parseJson3Events({
      events: [
        { tStartMs: 0, dDurationMs: 0 },
        { tStartMs: 120, dDurationMs: 800, segs: [{ utf8: "Bonjour " }, { utf8: "le\nmonde" }] },
        { tStartMs: 1000, dDurationMs: 400, segs: [{ utf8: "\n" }] },
        { tStartMs: 2000, dDurationMs: 500, segs: [{ utf8: "Suite." }] },
      ],
    });
    expect(cues).toEqual([
      { startMs: 120, durationMs: 800, text: "Bonjour le monde" },
      { startMs: 2000, durationMs: 500, text: "Suite." },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run tests/channels/caption-tracks.test.ts`

Expected: FAIL — cannot find module `@/lib/youtube/caption-tracks`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/youtube/caption-tracks.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run tests/channels/caption-tracks.test.ts`

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add tests/channels/caption-tracks.test.ts src/lib/youtube/caption-tracks.ts
git commit -m "$(cat <<'EOF'
feat(youtube): rank official caption tracks and parse timedtext json3

EOF
)"
```

Skip the commit unless the human asked.

---

### Task 2: Hook extract from timed cues

**Files:**
- Create: `src/lib/youtube/hook-extract.ts`
- Test: `tests/channels/hook-extract.test.ts`

**Interfaces:**
- Consumes: `CaptionCue` from `caption-tracks.ts`.
- Produces: `HOOK_WINDOW_MS`, `HOOK_MAX_QUOTES`, `HOOK_QUOTE_MAX_CHARS`, `HookExtract`, `extractHook`.

- [ ] **Step 1: Write the failing test**

Create `tests/channels/hook-extract.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { HOOK_WINDOW_MS, extractHook } from "@/lib/youtube/hook-extract";

describe("extractHook", () => {
  it("keeps only cues that start before 30s and splits into at most 3 quotes", () => {
    const hook = extractHook([
      { startMs: 0, durationMs: 2000, text: "Tu fais ça complètement à l'envers. Voici la preuve." },
      { startMs: 8000, durationMs: 2000, text: "Dans trente secondes tu vas voir le chiffre." },
      { startMs: 20000, durationMs: 2000, text: "Troisième phrase utile." },
      { startMs: HOOK_WINDOW_MS, durationMs: 2000, text: "Trop tard, hors fenêtre." },
      { startMs: 40000, durationMs: 2000, text: "Encore plus tard." },
    ]);
    expect(hook.quotes).toEqual([
      "Tu fais ça complètement à l'envers",
      "Voici la preuve",
      "Dans trente secondes tu vas voir le chiffre",
    ]);
    expect(hook.hookText).toContain("envers");
    expect(hook.cueCount).toBe(3);
    expect(hook.quotes.join(" ")).not.toContain("Trop tard");
  });

  it("returns empty quotes when nothing is spoken in the window", () => {
    expect(extractHook([{ startMs: 45_000, durationMs: 1000, text: "Plus tard." }])).toEqual({
      quotes: [],
      hookText: "",
      cueCount: 0,
    });
  });

  it("truncates a long quote at 140 characters on a word boundary when possible", () => {
    const long = `${"mot ".repeat(50)}fin.`;
    const hook = extractHook([{ startMs: 0, durationMs: 1000, text: long }]);
    expect(hook.quotes).toHaveLength(1);
    expect(hook.quotes[0]!.length).toBeLessThanOrEqual(140);
    expect(hook.quotes[0]!.endsWith("…") || hook.quotes[0]!.length <= 140).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run tests/channels/hook-extract.test.ts`

Expected: FAIL — cannot find module `@/lib/youtube/hook-extract`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/youtube/hook-extract.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run tests/channels/hook-extract.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/channels/hook-extract.test.ts src/lib/youtube/hook-extract.ts
git commit -m "$(cat <<'EOF'
feat(youtube): extract spoken hook quotes from the first 30s

EOF
)"
```

Skip unless asked.

---

### Task 3: Why categories, hold bands, and code facts

**Files:**
- Create: `src/lib/youtube/why-categories.ts`
- Create: `src/lib/youtube/why-performance.ts` (facts only in this task; `composeWhyVideo` arrives in Task 6)
- Modify: `src/lib/youtube/types.ts` (add why types at the end, after `YoutubeSearchResponse`)
- Test: `tests/channels/why-categories.test.ts`
- Test: `tests/channels/why-performance.test.ts`

**Interfaces:**
- Consumes: `videoPerformance` / `performanceScore` from `performance.ts`; `classifyVideoFormat` from `video-formats.ts`; `resolveViewsPerHour` from `working-subject.ts`; `SnapshotPair` from `stat-snapshots.ts`; `HookExtract` from Task 2.
- Produces: `WHY_CATEGORIES`, `WhyCategoryId`, `isWhyCategory`, `whyCategoryLabel`, `WhyHoldBand`, `holdBandFromNoul`, `WhyFacts`, `buildWhyFacts`, plus the `WhyVideoResponse` shape in `types.ts` (used by later tasks).

- [ ] **Step 1: Write the failing tests**

Create `tests/channels/why-categories.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { holdBandFromNoul, isWhyCategory, whyCategoryLabel } from "@/lib/youtube/why-categories";

describe("why categories", () => {
  it("accepts the closed packaging set and rejects format ids", () => {
    expect(isWhyCategory("curiosity_gap")).toBe(true);
    expect(isWhyCategory("tutorial")).toBe(false);
    expect(whyCategoryLabel("specific_payoff")).toBe("Résultat concret");
    expect(whyCategoryLabel("nope")).toBe("Autre accroche");
  });
});

describe("holdBandFromNoul", () => {
  it("maps noul away from 0.5 so 0.5 is unsure not medium hold", () => {
    expect(holdBandFromNoul(0.8)).toBe("holds");
    expect(holdBandFromNoul(0.2)).toBe("drops");
    expect(holdBandFromNoul(0.5)).toBe("unsure");
    expect(holdBandFromNoul(0.65)).toBe("holds");
    expect(holdBandFromNoul(0.35)).toBe("drops");
  });
});
```

Create `tests/channels/why-performance.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildWhyFacts } from "@/lib/youtube/why-performance";

const NOW = new Date("2026-09-19T12:00:00.000Z");

describe("buildWhyFacts", () => {
  it("uses the scored ×N and average VPH when there is no snapshot pair", () => {
    const facts = buildWhyFacts(
      {
        title: "Tuto Cursor 2.0 smash",
        description: "Pas à pas Cursor.",
        durationSeconds: 600,
        viewCount: 4000,
        publishedAt: "2026-08-01T00:00:00.000Z",
        medianViews: 1000,
        snapshots: null,
      },
      NOW,
    );
    expect(facts.overperformance).toBe(4);
    expect(facts.performance).toEqual({ kind: "scored", score: 4, band: "over" });
    expect(facts.velocityKind).toBe("average");
    expect(facts.viewsPerHour).toBeGreaterThan(0);
    expect(facts.formatId).toBe("tutorial");
    expect(facts.disclaimer).toBe("no_studio");
  });

  it("does not invent ×N for a video younger than 7 days", () => {
    const facts = buildWhyFacts(
      {
        title: "News flash",
        description: "",
        durationSeconds: 400,
        viewCount: 800,
        publishedAt: "2026-09-18T00:00:00.000Z",
        medianViews: 1000,
        snapshots: null,
      },
      NOW,
    );
    expect(facts.performance.kind).toBe("recent");
    expect(facts.overperformance).toBeNull();
  });

  it("marks velocity delta when two snapshots exist", () => {
    const facts = buildWhyFacts(
      {
        title: "V",
        description: "",
        durationSeconds: 400,
        viewCount: 5000,
        publishedAt: "2026-08-01T00:00:00.000Z",
        medianViews: 1000,
        snapshots: {
          latest: { capturedAt: "2026-09-19T12:00:00.000Z", viewCount: 5000, likeCount: 10 },
          previous: { capturedAt: "2026-09-19T08:00:00.000Z", viewCount: 4200, likeCount: 9 },
        },
      },
      NOW,
    );
    expect(facts.velocityKind).toBe("delta");
    expect(facts.viewsPerHour).toBe(200);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `./node_modules/.bin/vitest run tests/channels/why-categories.test.ts tests/channels/why-performance.test.ts`

Expected: FAIL — modules missing.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/youtube/why-categories.ts`:

```ts
export const WHY_CATEGORIES = [
  { id: "curiosity_gap", label: "Écart de curiosité" },
  { id: "specific_payoff", label: "Résultat concret" },
  { id: "identity_challenge", label: "Tu fais ça mal" },
  { id: "story_open", label: "Ouverture récit" },
  { id: "listicle", label: "Liste / top" },
  { id: "news_timely", label: "Actu / timing" },
  { id: "other", label: "Autre accroche" },
] as const;

export type WhyCategoryId = (typeof WHY_CATEGORIES)[number]["id"];
export const WHY_CATEGORY_IDS = WHY_CATEGORIES.map((item) => item.id) as [WhyCategoryId, ...WhyCategoryId[]];
export const OTHER_WHY_CATEGORY = "other" as const;

export type WhyHoldBand = "holds" | "unsure" | "drops";

export function isWhyCategory(value: unknown): value is WhyCategoryId {
  return typeof value === "string" && (WHY_CATEGORY_IDS as readonly string[]).includes(value);
}

export function whyCategoryLabel(id: string | null | undefined): string {
  return WHY_CATEGORIES.find((item) => item.id === id)?.label ?? "Autre accroche";
}

/** Noul is P(yes), not intensity. Near 0.5 = unsure, not “medium hold”. */
export function holdBandFromNoul(noul: number): WhyHoldBand {
  if (noul >= 0.65) return "holds";
  if (noul <= 0.35) return "drops";
  return "unsure";
}
```

Append to `src/lib/youtube/types.ts` (after `YoutubeSearchResponse`, before `VideoQuery`):

```ts
export type CaptionStatus = "ok" | "missing" | "blocked";
export type CaptionKind = "official" | "asr" | "unknown";
export type WhyDisclaimer = "no_studio";

export type WhyFacts = {
  overperformance: number | null;
  performance: VideoPerformance;
  viewsPerHour: number | null;
  velocityKind: "delta" | "average" | null;
  formatId: VideoFormatId;
  disclaimer: WhyDisclaimer;
};

export type WhyCaptions = {
  status: CaptionStatus;
  kind: CaptionKind | null;
  language: string | null;
  quotes: string[];
  hookText: string;
};

export type WhyJev = {
  used: boolean;
  note: number | null;
  holdNoul: number | null;
  holdBand: WhyHoldBand | null;
  categoryId: WhyCategoryId | null;
  confidence: number | null;
};

export type WhyVideoResponse = {
  videoId: string;
  facts: WhyFacts;
  captions: WhyCaptions;
  jev: WhyJev;
};
```

Add this import at the top of `src/lib/youtube/types.ts` (client-safe, no cycle: `why-categories.ts` does not import `types.ts`):

```ts
import type { WhyCategoryId, WhyHoldBand } from "./why-categories";
```

`VideoPerformance` and `VideoFormatId` are already imported in `types.ts`.

Create `src/lib/youtube/why-performance.ts`:

```ts
import { videoPerformance, type VideoPerformance } from "./performance";
import type { SnapshotPair } from "./stat-snapshots";
import type { WhyDisclaimer, WhyFacts } from "./types";
import { classifyVideoFormat } from "./video-formats";
import { resolveViewsPerHour } from "./working-subject";

export type WhyFactsInput = {
  title: string;
  description: string;
  durationSeconds: number;
  viewCount: number;
  publishedAt: string;
  medianViews: number | null;
  snapshots: SnapshotPair | null;
};

export function buildWhyFacts(input: WhyFactsInput, now: Date): WhyFacts {
  const performance: VideoPerformance = videoPerformance(
    { publishedAt: input.publishedAt, viewCount: input.viewCount },
    input.medianViews,
    now,
  );
  const resolved = resolveViewsPerHour(
    { viewCount: input.viewCount, publishedAt: input.publishedAt, snapshots: input.snapshots },
    now,
  );
  return {
    overperformance: performance.kind === "scored" ? performance.score : null,
    performance,
    viewsPerHour: resolved.viewsPerHour,
    velocityKind: resolved.kind,
    formatId: classifyVideoFormat(input.title, input.description, input.durationSeconds),
    disclaimer: "no_studio" satisfies WhyDisclaimer,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `./node_modules/.bin/vitest run tests/channels/why-categories.test.ts tests/channels/why-performance.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/youtube/why-categories.ts src/lib/youtube/why-performance.ts src/lib/youtube/types.ts tests/channels/why-categories.test.ts tests/channels/why-performance.test.ts
git commit -m "$(cat <<'EOF'
feat(youtube): code-owned why facts and packaging categories

EOF
)"
```

Skip unless asked.

---

## Chunk 2: Fetch captions and judge packaging

### Task 4: InnerTube captions fetch with documented fallback

**Files:**
- Create: `src/lib/youtube/captions.ts`
- Test: `tests/channels/captions.test.ts`

**Interfaces:**
- Consumes: `CaptionTrack`, `json3Url`, `parseJson3Events`, `pickCaptionTrack`, `captionLanguagePreference`, `isOfficialCaption` from Task 1; `YOUTUBE_FETCH_TIMEOUT_MS` from `api.ts`; `getSetting("language")`; `YoutubeTranscript.fetchTranscript` as fallback only.
- Produces: `CaptionFetchResult`, `fetchVideoCaptions`, `resetCaptionCache`, `CAPTION_CACHE_MS`.

- [ ] **Step 1: Write the failing test**

Create `tests/channels/captions.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/lib/db";
import { setSetting } from "@/lib/settings";

const fetchMock = vi.fn<typeof fetch>();
const transcriptMock = vi.fn();

vi.mock("youtube-transcript", () => ({
  YoutubeTranscript: { fetchTranscript: (...args: unknown[]) => transcriptMock(...args) },
}));

beforeEach(() => {
  getDb().exec("DELETE FROM settings");
  setSetting("language", "fr");
  fetchMock.mockReset();
  transcriptMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(async () => {
  const { resetCaptionCache } = await import("@/lib/youtube/captions");
  resetCaptionCache();
  vi.unstubAllGlobals();
});

const playerPayload = {
  captions: {
    playerCaptionsTracklistRenderer: {
      captionTracks: [
        {
          baseUrl: "https://www.youtube.com/api/timedtext?v=vid&lang=en&kind=asr&fmt=srv3",
          languageCode: "en",
          kind: "asr",
        },
        {
          baseUrl: "https://www.youtube.com/api/timedtext?v=vid&lang=fr",
          languageCode: "fr",
        },
      ],
    },
  },
};

describe("fetchVideoCaptions", () => {
  it("uses InnerTube ANDROID then official timedtext json3, not youtube-transcript", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify(playerPayload), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ events: [{ tStartMs: 0, dDurationMs: 1000, segs: [{ utf8: "Hook FR" }] }] }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    const { fetchVideoCaptions } = await import("@/lib/youtube/captions");
    const result = await fetchVideoCaptions("abcdefghijk");
    expect(result).toEqual({
      status: "ok",
      kind: "official",
      language: "fr",
      cues: [{ startMs: 0, durationMs: 1000, text: "Hook FR" }],
    });
    expect(String(fetchMock.mock.calls[0][0])).toContain("youtubei/v1/player");
    const playerInit = fetchMock.mock.calls[0][1] as RequestInit;
    expect(String(playerInit.headers)).toMatch(/com\.google\.android\.youtube/i);
    const playerBody = JSON.parse(String(playerInit.body));
    expect(playerBody.context.client.clientName).toBe("ANDROID");
    expect(playerBody.videoId).toBe("abcdefghijk");
    expect(String(fetchMock.mock.calls[1][0])).toContain("fmt=json3");
    expect(String(fetchMock.mock.calls[1][0])).toContain("lang=fr");
    expect(transcriptMock).not.toHaveBeenCalled();
  });

  it("falls back to youtube-transcript when InnerTube has no tracks", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ captions: {} }), { status: 200, headers: { "content-type": "application/json" } }),
    );
    transcriptMock.mockResolvedValueOnce([{ text: "Hello", offset: 0, duration: 1000 }]);
    const { fetchVideoCaptions } = await import("@/lib/youtube/captions");
    const result = await fetchVideoCaptions("abcdefghijk");
    expect(result.status).toBe("ok");
    expect(result.kind).toBe("unknown");
    expect(result.cues).toEqual([{ startMs: 0, durationMs: 1000, text: "Hello" }]);
    expect(transcriptMock).toHaveBeenCalled();
  });

  it("returns blocked when player and fallback both fail", async () => {
    fetchMock.mockRejectedValueOnce(new Error("blocked"));
    transcriptMock.mockRejectedValueOnce(new Error("nope"));
    const { fetchVideoCaptions } = await import("@/lib/youtube/captions");
    expect(await fetchVideoCaptions("abcdefghijk")).toEqual({
      status: "blocked",
      kind: null,
      language: null,
      cues: [],
    });
  });

  it("returns missing when both paths find no cues", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ captions: {} }), { status: 200, headers: { "content-type": "application/json" } }),
    );
    transcriptMock.mockRejectedValueOnce(new Error("No transcripts are available"));
    const { fetchVideoCaptions } = await import("@/lib/youtube/captions");
    expect(await fetchVideoCaptions("abcdefghijk")).toMatchObject({ status: "missing", cues: [] });
  });

  it("caches the result for 24h so a second call does not hit the network", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify(playerPayload), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ events: [{ tStartMs: 0, dDurationMs: 1, segs: [{ utf8: "A" }] }] }), {
          status: 200,
        }),
      );
    const { fetchVideoCaptions } = await import("@/lib/youtube/captions");
    await fetchVideoCaptions("abcdefghijk");
    await fetchVideoCaptions("abcdefghijk");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run tests/channels/captions.test.ts`

Expected: FAIL — cannot find module `@/lib/youtube/captions`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/youtube/captions.ts`:

```ts
import { YoutubeTranscript } from "youtube-transcript";
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
    headers: { "Content-Type": "application/json", "User-Agent": INNERTUBE_USER_AGENT },
    body: JSON.stringify({
      context: { client: { clientName: "ANDROID", clientVersion: INNERTUBE_CLIENT_VERSION, hl, gl: hl === "en" ? "US" : "FR" } },
      videoId,
    }),
  });
  const track = pickCaptionTrack(tracksFromPlayer(data), langs);
  if (!track) return null;
  const timed = await readJson(json3Url(track.baseUrl), { headers: { "User-Agent": INNERTUBE_USER_AGENT } });
  const cues = parseJson3Events(timed as { events?: Array<{ tStartMs?: number; dDurationMs?: number; segs?: Array<{ utf8?: string }> }> });
  return {
    status: cues.length > 0 ? "ok" : "missing",
    kind: isOfficialCaption(track) ? "official" : "asr",
    language: track.languageCode,
    cues,
  };
}

async function fetchViaLibrary(videoId: string, langs: string[]): Promise<CaptionFetchResult> {
  let lastError: unknown;
  for (const lang of [...langs, undefined]) {
    try {
      const rows = await YoutubeTranscript.fetchTranscript(videoId, lang ? { lang } : undefined);
      const cues = rows.map((row) => ({
        startMs: row.offset,
        durationMs: row.duration,
        text: row.text.replace(/\s+/g, " ").trim(),
      })).filter((cue) => cue.text);
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
```

`YoutubeTranscript.fetchTranscript` in `youtube-transcript` ^1.3 accepts `(videoId: string, config?: { lang?: string })`. The lang loop above is the locked call.

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run tests/channels/captions.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/youtube/captions.ts tests/channels/captions.test.ts
git commit -m "$(cat <<'EOF'
feat(youtube): fetch public captions via InnerTube timedtext

EOF
)"
```

Skip unless asked.

---

### Task 5: TypeSafe Jev why-package (Score + Noul + Choice)

**Files:**
- Create: `src/lib/typesafe/why-package.ts`
- Test: `tests/typesafe/why-package.test.ts`

**Interfaces:**
- Consumes: `evaluateSystemOne`, `typesafeApiKey` from `src/lib/typesafe/client.ts`; `WHY_CATEGORIES`, `isWhyCategory`, `holdBandFromNoul`, `OTHER_WHY_CATEGORY` from Task 3; `WhyJev` from `types.ts`.
- Produces: `WHY_CLICK_SCORE_CRITERIA`, `WhyPackageState`, `jevWhyPackage`.

- [ ] **Step 1: Write the failing test**

Create `tests/typesafe/why-package.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/lib/db";
import { setSetting } from "@/lib/settings";

const fetchMock = vi.fn<typeof fetch>();
let savedEnv: string | undefined;

const state = {
  title: "Tu fais ça à l'envers",
  descriptionExcerpt: "Preuve en 10 minutes.",
  hookText: "Voici le chiffre que personne ne montre",
  hookQuotes: ["Voici le chiffre que personne ne montre"],
  captionKind: "official" as const,
  language: "fr",
  overperformance: 4.2,
  performanceKind: "scored" as const,
  viewsPerHour: 180,
  velocityKind: "delta" as const,
};

beforeEach(() => {
  getDb().exec("DELETE FROM settings");
  savedEnv = process.env.TYPESAFE_API_KEY;
  delete process.env.TYPESAFE_API_KEY;
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (savedEnv === undefined) delete process.env.TYPESAFE_API_KEY;
  else process.env.TYPESAFE_API_KEY = savedEnv;
});

describe("jevWhyPackage", () => {
  it("returns unused empty judgments without a key", async () => {
    const { jevWhyPackage } = await import("@/lib/typesafe/why-package");
    expect(await jevWhyPackage(state)).toEqual({
      used: false,
      note: null,
      holdNoul: null,
      holdBand: null,
      categoryId: null,
      confidence: null,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("asks Score, Noul and Choice in one call and does not send pixels or ask for CTR", async () => {
    setSetting("typesafeApiKey", "tsk-test");
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          answers: {
            click: { type: "score", score: 3.2, confidence: 0.8 },
            hold: { type: "noul", noul: 0.71 },
            category: { type: "choice", choice: "curiosity_gap", confidence: 0.77 },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const { jevWhyPackage } = await import("@/lib/typesafe/why-package");
    const judged = await jevWhyPackage(state);
    expect(judged).toEqual({
      used: true,
      note: 8,
      holdNoul: 0.71,
      holdBand: "holds",
      categoryId: "curiosity_gap",
      confidence: 0.8,
    });
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body.model).toBe("jev-latest");
    expect(body.questions.click.type).toBe("score");
    expect(body.questions.hold.type).toBe("noul");
    expect(body.questions.category.type).toBe("choice");
    expect(body.state.package.overperformance).toBe(4.2);
    expect(JSON.stringify(body)).not.toMatch(/https?:|thumbnail|mqdefault|\.jpg|image\//i);
    expect(JSON.stringify(body.questions)).not.toMatch(/\bCTR\b|click-through|recalculate|invent/i);
    expect(body.questions.click.instructions).toMatch(/already computed/i);
    expect(body.questions.hold.instructions).toMatch(/already computed/i);
  });

  it("returns unused when TypeSafe fails", async () => {
    setSetting("typesafeApiKey", "tsk-test");
    fetchMock.mockRejectedValue(new Error("down"));
    const { jevWhyPackage } = await import("@/lib/typesafe/why-package");
    expect((await jevWhyPackage(state)).used).toBe(false);
  });
});
```

`note: 8` is `(3.2 / 4) * 10` rounded to one decimal = `8` or `8.0`. Use `8` if you `Math.round(x * 10) / 10` on `8.0`.

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run tests/typesafe/why-package.test.ts`

Expected: FAIL — cannot find module `@/lib/typesafe/why-package`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/typesafe/why-package.ts`:

```ts
import { holdBandFromNoul, isWhyCategory, OTHER_WHY_CATEGORY, WHY_CATEGORIES, type WhyCategoryId } from "@/lib/youtube/why-categories";
import type { CaptionKind, WhyJev } from "@/lib/youtube/types";
import { evaluateSystemOne, typesafeApiKey, type ChoiceQuestion, type NoulQuestion, type ScoreQuestion } from "./client";

export const WHY_CLICK_SCORE_CRITERIA = [
  "The title and spoken opening give almost no reason to click or stay.",
  "A clear topic, but the package is generic; a viewer could skip it.",
  "A competent package: specific title and an opening that matches the promise.",
  "A strong package: title creates a click reason and the first 30s would hold a typical viewer.",
  "An exceptional swipe-file package: title plus hook would be stolen immediately. Do not treat overperformance as proof.",
] as const;

export type WhyPackageState = {
  title: string;
  descriptionExcerpt: string;
  hookText: string;
  hookQuotes: string[];
  captionKind: CaptionKind | null;
  language: string | null;
  overperformance: number | null;
  performanceKind: "scored" | "recent" | "none";
  viewsPerHour: number | null;
  velocityKind: "delta" | "average" | null;
};

const unused = (): WhyJev => ({
  used: false,
  note: null,
  holdNoul: null,
  holdBand: null,
  categoryId: null,
  confidence: null,
});

function noteFromScore(score: number): number {
  const clamped = Math.min(4, Math.max(0, score));
  return Math.round((clamped / 4) * 10 * 10) / 10;
}

function categoryCriteria(): Record<string, string> {
  return Object.fromEntries(WHY_CATEGORIES.map((item) => [item.id, item.label]));
}

export async function jevWhyPackage(input: WhyPackageState, signal?: AbortSignal): Promise<WhyJev> {
  const apiKey = typesafeApiKey();
  if (!apiKey) return unused();

  const click: ScoreQuestion = {
    type: "score",
    instructions:
      "How strong is package.title plus package.hookText as a reason to click and open the video? package.overperformance and package.viewsPerHour are already computed by code — do not recalculate views, invent CTR, or treat ×N as proof. Judge packaging only. If hookText is empty, judge the title and descriptionExcerpt only.",
    criteria: WHY_CLICK_SCORE_CRITERIA,
  };
  const hold: NoulQuestion = {
    type: "noul",
    instructions:
      "Does package.hookText give a typical viewer a reason to keep watching past the first 30 seconds? If hookText is empty, the answer is no. package.overperformance is already computed — do not infer retention percentages or CTR.",
    criteria: {
      true: "The spoken opening creates an unfinished question, payoff, or tension that would hold a typical viewer.",
      false: "The opening is empty, generic, or finished; a typical viewer could leave.",
    },
  };
  const category: ChoiceQuestion = {
    type: "choice",
    instructions:
      "Which packaging pattern best describes why package.title plus package.hookText would earn a click? Pick other when none fit. Do not use view counts.",
    criteria: categoryCriteria(),
  };

  try {
    const answers = await evaluateSystemOne(apiKey, { package: input }, { click, hold, category }, signal);
    const scored = answers.click;
    const held = answers.hold;
    const chosen = answers.category;
    if (scored?.type !== "score") return unused();
    const holdNoul = held?.type === "noul" ? held.noul : null;
    const categoryId: WhyCategoryId | null =
      chosen?.type === "choice" && isWhyCategory(chosen.choice)
        ? chosen.choice
        : chosen?.type === "choice"
          ? OTHER_WHY_CATEGORY
          : null;
    return {
      used: true,
      note: noteFromScore(scored.score),
      holdNoul,
      holdBand: holdNoul === null ? null : holdBandFromNoul(holdNoul),
      categoryId,
      confidence: scored.confidence ?? (chosen?.type === "choice" ? chosen.confidence : null) ?? null,
    };
  } catch {
    return unused();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run tests/typesafe/why-package.test.ts`

Expected: PASS. `noteFromScore(3.2)` is exactly `8`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/typesafe/why-package.ts tests/typesafe/why-package.test.ts
git commit -m "$(cat <<'EOF'
feat(typesafe): judge title and hook packaging after code has ×N

EOF
)"
```

Skip unless asked.

---

## Chunk 3: Route, compose, UI

### Task 6: composeWhyVideo and GET /why

**Files:**
- Modify: `src/lib/youtube/why-performance.ts` — add `composeWhyVideo`
- Create: `src/app/api/channels/videos/[videoId]/why/route.ts`
- Test: extend `tests/channels/why-performance.test.ts`
- Test: `tests/channels/why-route.test.ts`

**Interfaces:**
- Consumes: `getVideo` / `getChannel` from `channel-store.ts`; `latestSnapshotPairs` from `stat-snapshots.ts`; `fetchVideoCaptions` from Task 4; `extractHook` from Task 2; `descriptionExcerpt` from `view.ts` is client-side — **do not import view.ts on the server**. Duplicate a 220-char excerpt inline in `composeWhyVideo` as `excerptText`. `jevWhyPackage` from Task 5; `buildWhyFacts` from Task 3.
- Produces: `composeWhyVideo(videoId, now?, signal?) => WhyVideoResponse | null`; GET handler returning 404 `{ error: "Vidéo inconnue" }` or 200 `WhyVideoResponse`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/channels/why-performance.test.ts`:

```ts
import * as store from "@/lib/youtube/channel-store";
import { getDb } from "@/lib/db";
import { beforeEach, vi } from "vitest";

const fetchCaptions = vi.fn();
const jevWhy = vi.fn();

vi.mock("@/lib/youtube/captions", () => ({
  fetchVideoCaptions: (...args: unknown[]) => fetchCaptions(...args),
}));
vi.mock("@/lib/typesafe/why-package", () => ({
  jevWhyPackage: (...args: unknown[]) => jevWhy(...args),
}));

// Keep the existing buildWhyFacts describe. Add:

describe("composeWhyVideo", () => {
  beforeEach(() => {
    getDb().exec("DELETE FROM followed_channels");
    fetchCaptions.mockReset();
    jevWhy.mockReset();
    const channelId = store.insertChannel(
      { youtubeChannelId: `UC${"z".repeat(22)}`, title: "Ma chaîne", handle: null, avatarUrl: null, subscriberCount: null, videoCount: null },
      { isMine: true },
    ).channel.id;
    store.finishSync(channelId, { medianViews: 1000, syncedAt: "2026-09-19T00:00:00.000Z" });
    store.upsertVideos(
      channelId,
      [
        {
          videoId: "whyvid00001",
          title: "Tuto Cursor 2.0 smash",
          publishedAt: "2026-08-01T00:00:00.000Z",
          durationSeconds: 600,
          viewCount: 4000,
          likeCount: null,
          thumbnailUrl: "https://i.ytimg.com/vi/whyvid00001/mqdefault.jpg",
          liveBroadcastContent: "none",
          description: "On parle de Cursor 2.0.",
        },
      ],
      "2026-09-19T00:00:00.000Z",
    );
  });

  it("returns null for an unknown id and does not fetch captions", async () => {
    const { composeWhyVideo } = await import("@/lib/youtube/why-performance");
    expect(await composeWhyVideo("missingxxxx")).toBeNull();
    expect(fetchCaptions).not.toHaveBeenCalled();
  });

  it("joins facts, hook quotes and jev without inventing captions", async () => {
    fetchCaptions.mockResolvedValue({
      status: "ok",
      kind: "official",
      language: "fr",
      cues: [{ startMs: 0, durationMs: 1000, text: "Tu vas voir le chiffre. Promis." }],
    });
    jevWhy.mockResolvedValue({
      used: true,
      note: 8,
      holdNoul: 0.7,
      holdBand: "holds",
      categoryId: "curiosity_gap",
      confidence: 0.8,
    });
    const { composeWhyVideo } = await import("@/lib/youtube/why-performance");
    const body = await composeWhyVideo("whyvid00001", new Date("2026-09-19T12:00:00.000Z"));
    expect(body?.videoId).toBe("whyvid00001");
    expect(body?.facts.overperformance).toBe(4);
    expect(body?.captions.quotes[0]).toContain("chiffre");
    expect(body?.jev.categoryId).toBe("curiosity_gap");
    expect(jevWhy.mock.calls[0][0].overperformance).toBe(4);
    expect(jevWhy.mock.calls[0][0].title).toBe("Tuto Cursor 2.0 smash");
  });
});
```

`insertChannel` returns `{ channel, inserted }`. `upsertVideos` accepts `VideoDetails` including optional `description` (already persisted). Put the `vi.mock` calls at the **top** of `tests/channels/why-performance.test.ts` (hoisted), not under `describe`. The existing `buildWhyFacts` tests stay in the same file and do not call the mocks.

Create `tests/channels/why-route.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as whyRoute } from "@/app/api/channels/videos/[videoId]/why/route";
import { getDb } from "@/lib/db";
import * as store from "@/lib/youtube/channel-store";
import type { WhyVideoResponse } from "@/lib/youtube/types";

const compose = vi.fn();

vi.mock("@/lib/youtube/why-performance", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/youtube/why-performance")>();
  return { ...actual, composeWhyVideo: (...args: unknown[]) => compose(...args) };
});

const params = (videoId: string) => ({ params: Promise.resolve({ videoId }) });

beforeEach(() => {
  getDb().exec("DELETE FROM followed_channels");
  compose.mockReset();
  const channelId = store.insertChannel(
    { youtubeChannelId: `UC${"w".repeat(22)}`, title: "Ma chaîne", handle: null, avatarUrl: null, subscriberCount: null, videoCount: null },
    { isMine: true },
  ).channel.id;
  store.finishSync(channelId, { medianViews: 1000, syncedAt: new Date().toISOString() });
  store.upsertVideos(
    channelId,
    [
      {
        videoId: "routevid001",
        title: "Vidéo routevid001",
        publishedAt: new Date(Date.now() - 30 * 86_400_000).toISOString(),
        durationSeconds: 600,
        viewCount: 5000,
        likeCount: null,
        thumbnailUrl: "https://i.ytimg.com/vi/routevid001/mqdefault.jpg",
        liveBroadcastContent: "none",
      },
    ],
    new Date().toISOString(),
  );
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/channels/videos/[videoId]/why", () => {
  it("returns 404 when compose returns null", async () => {
    compose.mockResolvedValue(null);
    const res = await whyRoute(new Request("http://localhost/api/channels/videos/nope/why"), params("nope"));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Vidéo inconnue" });
  });

  it("returns the composed body for a followed video", async () => {
    const body: WhyVideoResponse = {
      videoId: "routevid001",
      facts: {
        overperformance: 5,
        performance: { kind: "scored", score: 5, band: "over" },
        viewsPerHour: 10,
        velocityKind: "average",
        formatId: "other",
        disclaimer: "no_studio",
      },
      captions: { status: "missing", kind: null, language: null, quotes: [], hookText: "" },
      jev: { used: false, note: null, holdNoul: null, holdBand: null, categoryId: null, confidence: null },
    };
    compose.mockResolvedValue(body);
    const res = await whyRoute(new Request("http://localhost/api/channels/videos/routevid001/why"), params("routevid001"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(body);
    expect(compose).toHaveBeenCalledWith("routevid001", expect.any(Date), expect.any(AbortSignal));
  });
});
```

Locked split: `why-performance.test.ts` mocks `fetchVideoCaptions` and `jevWhyPackage` and tests real `composeWhyVideo`. `why-route.test.ts` mocks only `composeWhyVideo` and tests HTTP 404/200.

- [ ] **Step 2: Run tests to verify they fail**

Run: `./node_modules/.bin/vitest run tests/channels/why-performance.test.ts tests/channels/why-route.test.ts`

Expected: FAIL — `composeWhyVideo` or route missing.

- [ ] **Step 3: Write minimal implementation**

Add to `src/lib/youtube/why-performance.ts`:

```ts
import { jevWhyPackage } from "@/lib/typesafe/why-package";
import { getChannel, getVideo } from "./channel-store";
import { fetchVideoCaptions } from "./captions";
import { extractHook } from "./hook-extract";
import { latestSnapshotPairs } from "./stat-snapshots";
import type { WhyCaptions, WhyVideoResponse } from "./types";

function excerptText(text: string, max = 220): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= max) return compact;
  return `${compact.slice(0, max - 1).trimEnd()}…`;
}

export async function composeWhyVideo(
  videoId: string,
  now: Date = new Date(),
  signal?: AbortSignal,
): Promise<WhyVideoResponse | null> {
  const video = getVideo(videoId);
  if (!video) return null;
  const channel = getChannel(video.channel_id);
  if (!channel) return null;
  const snapshots = latestSnapshotPairs([videoId]).get(videoId) ?? null;
  const facts = buildWhyFacts(
    {
      title: video.title,
      description: video.description ?? "",
      durationSeconds: video.duration_seconds,
      viewCount: video.view_count,
      publishedAt: video.published_at,
      medianViews: channel.median_views,
      snapshots,
    },
    now,
  );
  const fetched = await fetchVideoCaptions(videoId);
  const hook = extractHook(fetched.cues);
  const captions: WhyCaptions = {
    status: fetched.status,
    kind: fetched.kind,
    language: fetched.language,
    quotes: hook.quotes,
    hookText: hook.hookText,
  };
  const jev = await jevWhyPackage(
    {
      title: video.title,
      descriptionExcerpt: excerptText(video.description ?? ""),
      hookText: hook.hookText,
      hookQuotes: hook.quotes,
      captionKind: fetched.kind,
      language: fetched.language,
      overperformance: facts.overperformance,
      performanceKind: facts.performance.kind,
      viewsPerHour: facts.viewsPerHour,
      velocityKind: facts.velocityKind,
    },
    signal,
  );
  return { videoId, facts, captions, jev };
}
```

Create `src/app/api/channels/videos/[videoId]/why/route.ts`:

```ts
import { NextResponse } from "next/server";
import { composeWhyVideo } from "@/lib/youtube/why-performance";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ videoId: string }> }) {
  const { videoId } = await params;
  const body = await composeWhyVideo(videoId, new Date(), request.signal);
  if (!body) return NextResponse.json({ error: "Vidéo inconnue" }, { status: 404 });
  return NextResponse.json(body);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `./node_modules/.bin/vitest run tests/channels/why-performance.test.ts tests/channels/why-route.test.ts tests/channels/caption-tracks.test.ts tests/channels/hook-extract.test.ts tests/channels/why-categories.test.ts tests/channels/captions.test.ts tests/typesafe/why-package.test.ts`

Expected: PASS. `upsertVideos` already writes `description`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/youtube/why-performance.ts src/app/api/channels/videos/[videoId]/why/route.ts tests/channels/why-performance.test.ts tests/channels/why-route.test.ts
git commit -m "$(cat <<'EOF'
feat(youtube): expose honest why-it-performs payload per followed video

EOF
)"
```

Skip unless asked.

---

### Task 7: VideoInfoDialog « Pourquoi ça performe »

**Files:**
- Modify: `src/components/library/followed-channels/api.ts`
- Modify: `src/components/library/followed-channels/view.ts`
- Create: `src/components/library/followed-channels/WhyPerformanceSection.tsx`
- Modify: `src/components/library/followed-channels/VideoInfoDialog.tsx`
- Test: `tests/channels/view.test.ts`
- Test: `tests/library/followed-themes-ui.test.tsx`

**Interfaces:**
- Consumes: `WhyVideoResponse` from `types.ts`; `whyCategoryLabel` / `WhyHoldBand` from `why-categories.ts`; `channelsApi.why`.
- Produces: `channelsApi.why(videoId)`, `WHY_DISCLAIMER`, `captionSourceLabel`, `holdBandLabel`, `WhyPerformanceSection`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/channels/view.test.ts`:

```ts
import { captionSourceLabel, holdBandLabel, WHY_DISCLAIMER } from "@/components/library/followed-channels/view";

describe("why copy", () => {
  it("never claims Studio metrics and labels caption source + hold honestly", () => {
    expect(WHY_DISCLAIMER).toMatch(/pas de CTR/i);
    expect(WHY_DISCLAIMER).toMatch(/médiane/i);
    expect(captionSourceLabel({ status: "ok", kind: "official", language: "fr" })).toBe("Sous-titres officiels (fr)");
    expect(captionSourceLabel({ status: "ok", kind: "asr", language: "en" })).toBe("Sous-titres auto (en)");
    expect(captionSourceLabel({ status: "missing", kind: null, language: null })).toBe(
      "Pas de sous-titres publics — on ne peut pas juger l'accroche parlée",
    );
    expect(captionSourceLabel({ status: "blocked", kind: null, language: null })).toBe(
      "Sous-titres inaccessibles pour le moment",
    );
    expect(holdBandLabel("holds")).toBe("ouverture parlée plutôt retenante");
    expect(holdBandLabel("drops")).toBe("ouverture parlée peu retenante");
    expect(holdBandLabel("unsure")).toBe("ouverture parlée incertaine (Jev ~50/50)");
  });
});
```

In `tests/library/followed-themes-ui.test.tsx`, add `why` to the `channelsApi` mock next to `workingSubject`:

```ts
const why = vi.fn();
// inside the vi.mock factory:
why: (...args: unknown[]) => why(...args),
```

`why` must be declared in a way the factory can close over (same pattern as `workingSubject`: hoist `const why = vi.fn()` then wrap). In `beforeEach`, `why.mockReset()` and:

```ts
why.mockResolvedValue({
  videoId: "c1",
  facts: {
    overperformance: 4,
    performance: { kind: "scored", score: 4, band: "over" },
    viewsPerHour: 12,
    velocityKind: "average",
    formatId: "tutorial",
    disclaimer: "no_studio",
  },
  captions: {
    status: "ok",
    kind: "official",
    language: "fr",
    quotes: ["Voici le chiffre"],
    hookText: "Voici le chiffre",
  },
  jev: {
    used: true,
    note: 8,
    holdNoul: 0.7,
    holdBand: "holds",
    categoryId: "curiosity_gap",
    confidence: 0.8,
  },
});
```

After the existing `root.render(<VideoInfoDialog ...>)` inside `act`, flush the `why` mock then assert:

```ts
    await act(async () => {
      await Promise.resolve();
    });
    expect(document.body.textContent).toContain("Pourquoi ça performe");
    expect(document.body.textContent).toMatch(/pas de CTR/i);
    expect(document.body.textContent).toContain("Voici le chiffre");
    expect(document.body.textContent).toContain("Écart de curiosité");
    expect(document.body.textContent).toContain("8,0/10");
    expect(document.body.textContent).not.toMatch(/\bCTR\b.*%/);
```

Add a second case in the same file: `why.mockResolvedValue` with `captions.status = "missing"`, `jev.used = false` — expect the missing-captions sentence and **no** `/10` note.

- [ ] **Step 2: Run tests to verify they fail**

Run: `./node_modules/.bin/vitest run tests/channels/view.test.ts tests/library/followed-themes-ui.test.tsx`

Expected: FAIL — `WHY_DISCLAIMER` / heading missing.

- [ ] **Step 3: Write minimal implementation**

Add to `src/components/library/followed-channels/view.ts`:

```ts
import type { CaptionKind, CaptionStatus } from "@/lib/youtube/types";
import type { WhyHoldBand } from "@/lib/youtube/why-categories";

export const WHY_DISCLAIMER =
  "Sans YouTube Studio : pas de CTR, pas d'impressions, pas de rétention. ×N = vues ÷ médiane de la chaîne.";

export function captionSourceLabel(input: { status: CaptionStatus; kind: CaptionKind | null; language: string | null }): string {
  if (input.status === "missing") return "Pas de sous-titres publics — on ne peut pas juger l'accroche parlée";
  if (input.status === "blocked") return "Sous-titres inaccessibles pour le moment";
  const lang = input.language ? ` (${input.language})` : "";
  if (input.kind === "official") return `Sous-titres officiels${lang}`;
  if (input.kind === "asr") return `Sous-titres auto${lang}`;
  return `Sous-titres publics${lang}`;
}

export function holdBandLabel(band: WhyHoldBand): string {
  if (band === "holds") return "ouverture parlée plutôt retenante";
  if (band === "drops") return "ouverture parlée peu retenante";
  return "ouverture parlée incertaine (Jev ~50/50)";
}
```

`WHY_DISCLAIMER` uses a straight apostrophe in the `.ts` string (`d'impressions`). The JSX file uses `&apos;` for apostrophes in markup.

Add to `channelsApi` in `src/components/library/followed-channels/api.ts` (import `WhyVideoResponse`):

```ts
  why: (videoId: string) => request<WhyVideoResponse>(`/api/channels/videos/${encodeURIComponent(videoId)}/why`),
```

Create `src/components/library/followed-channels/WhyPerformanceSection.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import type { VideoListItem, WhyVideoResponse } from "@/lib/youtube/types";
import { whyCategoryLabel } from "@/lib/youtube/why-categories";
import { channelsApi } from "./api";
import {
  WHY_DISCLAIMER,
  captionSourceLabel,
  climbHint,
  formatJevNote,
  formatScore,
  formatViewsPerHour,
  holdBandLabel,
} from "./view";

export default function WhyPerformanceSection({ video }: { video: VideoListItem }) {
  const [data, setData] = useState<WhyVideoResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    channelsApi
      .why(video.videoId)
      .then((body) => {
        if (!cancelled) {
          setData(body);
          setFailed(false);
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [video.videoId]);

  return (
    <section className="grid gap-2 border-t border-dashed pt-3" aria-labelledby="why-performs-title">
      <h3 id="why-performs-title" className="text-sm font-semibold">
        Pourquoi ça performe
      </h3>
      <p className="text-[11px] text-pretty text-muted-foreground">{WHY_DISCLAIMER}</p>
      {failed ? (
        <p className="text-sm text-destructive">Impossible de charger l&apos;analyse.</p>
      ) : data === null ? (
        <div className="grid gap-2">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : (
        <WhyBody data={data} />
      )}
    </section>
  );
}

function WhyBody({ data }: { data: WhyVideoResponse }) {
  const { facts, captions, jev } = data;
  const cote =
    facts.performance.kind === "scored"
      ? formatScore(facts.performance.score)
      : facts.performance.kind === "recent"
        ? "trop tôt pour un ×N"
        : "score indisponible";

  return (
    <div className="grid gap-2 text-sm">
      <p>
        <span className="tabular-nums font-medium">{cote}</span>
        {facts.performance.kind === "scored" ? (
          <span className="text-muted-foreground"> vs médiane de la chaîne</span>
        ) : null}
      </p>
      {facts.viewsPerHour != null && facts.velocityKind ? (
        <p className="text-muted-foreground" title={climbHint(facts.velocityKind)}>
          {formatViewsPerHour(facts.viewsPerHour)}
          {facts.velocityKind === "delta" ? " · ça grimpe" : " · moy. depuis publication"}
        </p>
      ) : null}
      <p className="text-[11px] text-muted-foreground">{captionSourceLabel(captions)}</p>
      {captions.quotes.length > 0 ? (
        <blockquote className="grid gap-1 border-l-2 pl-3 text-pretty">
          {captions.quotes.map((quote) => (
            <p key={quote}>« {quote} »</p>
          ))}
        </blockquote>
      ) : null}
      {jev.used && jev.categoryId ? (
        <p>
          Catégorie : <span className="font-medium">{whyCategoryLabel(jev.categoryId)}</span>
        </p>
      ) : null}
      {jev.used && jev.note != null ? (
        <p>
          Note packaging (Jev) : <span className="tabular-nums">{formatJevNote(jev.note)}</span>
          <span className="text-muted-foreground"> — titre + accroche, pas le CTR</span>
        </p>
      ) : null}
      {jev.used && jev.holdBand ? (
        <p className="text-muted-foreground">{holdBandLabel(jev.holdBand)}</p>
      ) : null}
    </div>
  );
}
```

`channelsApi.why` does not take `AbortSignal` (`request` has no signal). The `cancelled` flag drops a stale response after unmount. Do not add a signal in v1.

Modify `VideoInfoDialog.tsx`:

1. Import `WhyPerformanceSection`.
2. Change `DialogContent` class to `max-h-[90vh] overflow-y-auto p-0 sm:max-w-xl` (drop `overflow-hidden` so the why block can scroll).
3. Insert `<WhyPerformanceSection video={video} />` after the description excerpt and before `DialogFooter`.
4. Replace the local `format` line with:

```ts
  const format = videoFormatLabel(video.formatId ?? classifyVideoFormat(video.title, video.description, video.durationSeconds));
```

Full dialog body after the excerpt:

```tsx
          {excerpt ? <p className="text-sm text-pretty text-muted-foreground">{excerpt}</p> : null}

          <WhyPerformanceSection video={video} />

          <DialogFooter className="p-0 sm:justify-between">
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `./node_modules/.bin/vitest run tests/channels/view.test.ts tests/library/followed-themes-ui.test.tsx`

Expected: PASS. The dialog test already flushed the `why` mock with `await act(async () => { await Promise.resolve(); })`.

Also run the why unit/route suite:

Run: `./node_modules/.bin/vitest run tests/channels/caption-tracks.test.ts tests/channels/hook-extract.test.ts tests/channels/why-categories.test.ts tests/channels/why-performance.test.ts tests/channels/captions.test.ts tests/typesafe/why-package.test.ts tests/channels/why-route.test.ts`

Expected: PASS.

- [ ] **Step 5: Browser-verify on :3000**

If the UI must show source changes: `docker compose up -d --build` from `/Users/antoinevigneau/thumbgen-real`. Open Bibliothèque → Inspirations → Chaînes suivies. Click a followed thumbnail (grid or Tendance). Confirm:

- Heading `Pourquoi ça performe` and the disclaimer.
- ×N or `trop tôt pour un ×N`, never a fake CTR.
- Hook quotes when captions exist; the missing-captions sentence otherwise.
- Jev category + `/10` only when a TypeSafe key is configured; hidden when not.
- Footer actions still work (YouTube + référence).
- Do not click « Actualiser ».

- [ ] **Step 6: Commit**

```bash
git add src/components/library/followed-channels/api.ts src/components/library/followed-channels/view.ts src/components/library/followed-channels/WhyPerformanceSection.tsx src/components/library/followed-channels/VideoInfoDialog.tsx tests/channels/view.test.ts tests/library/followed-themes-ui.test.tsx
git commit -m "$(cat <<'EOF'
feat(library): show why a followed video performs in the info dialog

EOF
)"
```

Skip unless asked.

---

## Chunk 4: Later only

### Task 8: Whisper + Most Replayed (do not implement this session)

**Files:** none this session.

**Interfaces:** none this session.

This task exists so the plan has no hanging “maybe later” without a contract. **Do not write code, tests, or commits for it now.**

When (and only when) the human asks:

1. **Whisper fallback** if `fetchVideoCaptions` returned `missing` **and** the user confirmed a paid/local transcribe of **audio only** for that one video. Never download the video mux. Never batch-transcribe the swipe file. Store nothing longer than 24 h. UI copy: « Transcription locale — pas des sous-titres YouTube ».
2. **Most Replayed heatmap** via InnerTube `/next` markers (`reckerp/yt-most-replayed` algorithm, no new dependency if we parse markers ourselves). Display as « moments les plus rejoués (public, ≠ rétention Studio) ». Never label it AVD or retention %.

Until then: v1 stops at public captions + hook + Jev.

- [ ] **Step 1: Do not implement**

No test, no code, no commit.

---

## Self-review

**1. Spec coverage**

| Requirement | Task |
|---|---|
| Research transcripts (InnerTube official timedtext, youtube-transcript fallback, Data API no, yt-dlp no, Whisper later) | Deepened facts + Task 4 + Task 8 |
| Research OSS / papers / products | Deepened facts (breakout-analyzer, viral-ops, yt-outlier-mcp, viralscopes-as-anti-pattern, academic views≠CTR) |
| Honest inference without Studio | Task 3 `buildWhyFacts` + disclaimer |
| Consume snapshots / ×N, do not respec poller | Task 3 + Task 6; snapshots plan untouched |
| Jev Score/Noul/Choice after code has ×N; not calculator; not fetcher | Task 5 |
| Hook = first ~30s + title + description in code | Task 2 + Task 6 excerpt |
| UI on thumbnail click « Pourquoi ça performe » | Task 7 |
| Factual ×N + quotes + Jev note + category | Task 7 `WhyBody` |
| Never fake Studio metrics | Global constraints + `WHY_DISCLAIMER` + tests |
| FR/EN caption preference | Task 1 + Task 4 (`settings.language` then fr/en) |
| Followed `VideoInfoDialog` / Tendance / working-subject | Task 7; ranking files unchanged |
| YAGNI: no Whisper v1, no heatmap v1, no search dialog, no agent refactor | Task 8 + file structure |

**2. Placeholder scan**

No TBD / TODO / “implement later” / “add validation” / “similar to Task N” in implementable tasks. Task 8 is an explicit non-implementation contract, not a blank.

**3. Type consistency**

| Name | Defined | Used |
|---|---|---|
| `CaptionTrack` / `CaptionCue` | Task 1 | Tasks 2, 4 |
| `HookExtract` / `extractHook` | Task 2 | Task 6 |
| `WhyCategoryId` / `WhyHoldBand` / `holdBandFromNoul` | Task 3 | Tasks 5, 7 |
| `WhyFacts` / `WhyCaptions` / `WhyJev` / `WhyVideoResponse` | Task 3 (`types.ts`) | Tasks 5–7 |
| `CaptionFetchResult` / `fetchVideoCaptions` | Task 4 | Task 6 |
| `WhyPackageState` / `jevWhyPackage` | Task 5 | Task 6 |
| `composeWhyVideo` | Task 6 | Task 6 route |
| `channelsApi.why` | Task 7 | Task 7 UI |
| `velocityKind` `"delta" \| "average"` | existing `working-subject.ts` | Tasks 3, 5, 7 |
| `formatJevNote` / `climbHint` | existing `view.ts` | Task 7 |

Jev `note` is 0–10 from Score 0–4, same rounding as Tendance (`Math.round((clamped / 4) * 10 * 10) / 10`). Category ids are `WHY_CATEGORIES`, never `VIDEO_FORMATS`.
