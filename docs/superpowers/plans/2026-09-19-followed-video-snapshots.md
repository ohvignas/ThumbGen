# Followed-video snapshots + honest Tendance Youtube Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect new followed-channel uploads without spending playlist quota, keep a 30-day rolling `videos.list` view/like history, and make « 🏆 Tendance Youtube » the top-4 ranking of every followed video from the last 7 days — code-owned ×N / velocity / swipe rank, TypeSafe Choice for format, TypeSafe Score for a package note, honest « ça grimpe » only when two snapshots exist.

**Architecture:** A new SQLite table `video_stat_snapshots` is written on every existing `upsertVideos` / `updateVideoStats` path and by a lightweight in-process poller. The poller reads each followed channel’s public Atom RSS (0 quota) for new ids, then calls `videos.list` only for videos younger than 7 days whose last snapshot is older than 4 hours. Trend ranking is pure code in `working-subject.ts`: all 7-day followed videos with `viewCount > 0`, sorted by `swipeRankKey(overperformance)` (log-views fallback when the channel has no median). TypeSafe Jev then (1) **Choice**-classifies format from title+description and (2) **Score**-grades the swipe package using those texts plus the already-computed ×N / VPH as context — never as numbers to recalculate. Code re-sorts with `applyJevNudge` and takes 4. Display: format + note + CODE band (surperforme / dans la moyenne / sous-performe).

**Tech Stack:** Next.js App Router (one long-lived Node process in Docker), better-sqlite3, existing YouTube Data API client (`src/lib/youtube/api.ts`), Vitest 4, no new npm dependencies, no XML library (regex parse of YouTube’s Atom `yt:videoId`).

## Global Constraints

- Work in `/Users/antoinevigneau/thumbgen-real` (main repo). Do **not** create a git worktree. Do **not** start a new branch.
- Do **not** commit unless the human later asks. Each task still lists a `git commit` step (skill requirement) — **skip it when executing**.
- Do **not** push, merge, or open a PR. Do **not** run finishing-a-development-branch.
- Do **not** touch `data/thumbgen.db` or any live user data. Tests use `tests/setup.ts` (`THUMBGEN_DB_PATH` temp file). Every test that writes channel rows starts with `getDb().exec("DELETE FROM followed_channels")` (videos and snapshots cascade).
- Do **not** call paid APIs (OpenRouter, Perplexity, TypeSafe, image models) or the live YouTube Data API. YouTube in tests goes through `tests/channels/fake-youtube.ts` (`vi.stubGlobal("fetch", fake.fetch)`). RSS tests use the same fake (www.youtube.com Atom) or a local `fetch` stub — never a real `feeds/videos.xml` hit.
- Tests: `./node_modules/.bin/vitest run <file>` (no `npx`). Node: `/opt/homebrew/bin/node` if `node` is missing. Types: `./node_modules/.bin/tsc --noEmit`.
- TypeSafe Jev is **not** a YouTube stats API and **not** a calculator. Read `.cursor/skills/typesafe-ai/SKILL.md`. **CODE** loads the channel’s other videos, computes ×N vs median, snapshot velocity, swipe rank, and the surperforme / moyenne / sous-performe band (`performanceBand`: ≥×3 / ×0,5–×3 / <×0,5). **TypeSafe Choice** assigns the closed format taxonomy in `video-formats.ts` (tutoriel, documentaire, test, vlog, … + `other`) from title+description. **TypeSafe Score** returns a package note (5 levels → display /10) after code has attached facts (`title`, `description`, `overperformance`, `viewsPerHour`, `velocityKind`) as context. Never send a pile of raw view counts and ask Jev to invent ×N. Missing key / failure → local `classifyVideoFormat` fallback, no note, numeric rank unchanged. No live TypeSafe calls in tests or from this agent.
- YouTube Data API is a **snapshot** (views, likes, `publishedAt`). No CTR, no impressions for others. Analytics OAuth is owner-only and out of scope.
- Retention: prune snapshots with `captured_at` older than **30 days** (YouTube ToS Non-Authorized Data). Do not keep a longer history.
- Detection default is **RSS poll**. WebSub is Task 8 (optional) and is **not** implemented in this session — Docker `:3000` is `127.0.0.1` with no public HTTPS callback.
- Forbidden: Invidious, Piped, yt-dlp, Social Blade, any third-party scrape host.
- « 🏆 Tendance Youtube » is **not** a shared-subject cluster and **not** a tiny filtered subset. Pool = every followed-channel video with `published_at` in the last 7 days. Display the **top 4** by performance (or fewer if fewer than 4 exist). Hard-exclude only `viewCount === 0` (a dead row must not sit at #1). Do **not** require overperf > 1 or velocity ≥ 1.5. Do **not** require one-per-channel diversity. Heading stays `🏆 Tendance Youtube`; no pedagogical subtitle on that card.
- UI copy is French; JSX apostrophes as `&apos;`. `cn` from `"cn"`.
- Docker: when the UI must show on http://localhost:3000, `docker compose up -d --build` from `/Users/antoinevigneau/thumbgen-real` (never a worktree). Browser-verify Inspirations without clicking « Actualiser » / « Tout actualiser » (those spend quota).

---

## Deepened facts (read 2026-09-19, this repo)

**YouTube**
- `videos.list` / `playlistItems.list` = 1 quota unit per call, 50 ids. `search.list` = 100. Public channel Atom `https://www.youtube.com/feeds/videos.xml?channel_id=UC…` is 0 quota, ~15 latest uploads, includes Shorts. Entries expose `<yt:videoId>`.
- WebSub (PubSubHubbub `https://pubsubhubbub.appspot.com`) needs a public HTTPS callback. Compose binds `127.0.0.1:3000` only → RSS poll is the default.
- Current sync (`src/lib/youtube/sync.ts`): playlist walk + `videos.list` **overwrites** `channel_videos.view_count`. `stats_updated_at` is the only freshness signal. No history.
- Stale full-sync is 12 h (`STALE_AFTER_MS`), kicked by `ChannelSyncTrigger` → `POST /api/channels/sync-stale`. Background state lives on `globalThis.__thumbgen_channel_runtime`.
- `working-subject.ts` ranks every followed video from the last 7 days (`viewCount > 0`). Rank = `swipeRankKey(views ÷ channel median)`, `log2(views)` if no median. No overperf/velocity gate. Heading is `🏆 Tendance Youtube`.
- `swipeRankKey` (`src/lib/youtube/swipe-rank.ts`): `log2(min(score,20)) * recency * view-credibility`. `score <= 0` or `null` → `null`. TypeSafe Jev (`jevTrendJudgments`) Choice-classifies format and Score-grades packaging on the already-ranked shortlist (`SWIPE_RERANK_TOP` = 20). `applyJevNudge` is a rank nudge only. Never send raw view piles to Jev.

**DB**
- `migrateChannelTables` in `src/lib/youtube/migrations.ts`, called from `src/lib/db.ts` `init`. Pattern: `CREATE TABLE IF NOT EXISTS` + defensive `PRAGMA table_info` column adds. `foreign_keys = ON`. `channel_videos.video_id` is the natural FK for snapshots. `DELETE FROM followed_channels` already cascades videos.

**UI**
- `TypesSummary` hardcodes the heading, shows `subject.why` and up to 4 tiles, climb chip = `formatViewsPerHour`. Empty copy today lies (« grimpe assez fort »).
- Section blurb in `FollowedChannelsSection.tsx` also says « qui grimpent » — update so the page does not contradict the hero.

---

## Design rulings (locked)

| Decision | Ruling |
|---|---|
| Table | `video_stat_snapshots (video_id, captured_at, view_count, like_count)` PK `(video_id, captured_at)`, FK `channel_videos(video_id) ON DELETE CASCADE`, indexes `(video_id, captured_at)` and `(captured_at)`. |
| When to write | Same transaction as `upsertVideos` and `updateVideoStats`. `INSERT OR IGNORE` so a repeated stamp is a no-op. Unchanged view counts still get a new row when the stamp changes (proves the video did not grow). |
| Backfill | On migrate, one row per existing `channel_videos` using `stats_updated_at` / current counts, only if that `video_id` has no snapshot yet. Gives a t0; velocity stays « average » until a second relevé. |
| Prune | `DELETE … WHERE captured_at < now-30d` after each snapshot batch and at the end of a poll. |
| Young refresh | Videos with `published_at` in the last **7 days** whose latest snapshot is missing or older than **4 hours**. |
| RSS throttle | Whole poller at most once per **15 minutes** (runtime, like stale-sync). Restart may poll immediately (RSS is free; `videos.list` is gated by snapshot age). |
| New ids from RSS | `fetchVideos` + existing `keepVideo` (drop lives; drop ≤180 s when the stored playlist is not `UULF`). Then `upsertVideos` (records a snapshot). |
| Trigger | `POST /api/channels/sync-stale` also `queueSnapshotPoll()`. Do **not** fold the poller into `queueChannelSyncs` (jobs tests would hit RSS). Skip poller when there is no YouTube key or the quota is blocked. Skip a channel that holds the sync lock. |
| Tendance pool | `published_at >= now-7d` AND `viewCount > 0`. No overperf/velocity gate. No shared topic. No one-per-channel fill. |
| Tendance rank | CODE first: `swipeRankKey({ score: views/median, ageDays, viewCount })`; if `null`, `Math.log2(viewCount)`; then newer `publishedAt`. Then Jev **Score** (0–1) nudges via existing `applyJevNudge`. Take 4. |
| TypeSafe Choice | One Choice per shortlist video (`SWIPE_RERANK_TOP`). Criteria = `VIDEO_FORMATS` ids + `other`. State is title, description, durationSeconds. Fallback: `classifyVideoFormat`. |
| TypeSafe Score | One Score per shortlist video. 5 concrete levels (0–4). Display note = `(score / 4) * 10`. Instructions tell Jev the ×N and VPH are **already computed** — judge packaging only. |
| Grimpe honesty | ≥2 snapshots → `viewsPerHour` = Δviews / max(1, Δhours), `velocityKind = "delta"`. Else lifetime `views/hours`, `velocityKind = "average"`. Why-line says « ça grimpe » only when **every** picked tile is `delta`; otherwise « moy. depuis publication ». Never say « accélère ». Tile `title` = `climbHint(kind)`. |
| Display | Compact: format label + note `/10` (if Jev ran) + visible CODE words `Surperforme` / `Dans la moyenne` / `Sous-performe` (`performanceBandLabel`, ≥×3 / ×0,5–×3 / <×0,5) + ×N badge. Tile `title` stays the climb hint. No pedagogical subtitle under the heading. |
| WebSub | Task 8 only. Skip this session. |

---

## File Structure

**Create**
- `src/lib/youtube/stat-snapshots.ts` — snapshot SQL: insert, latest pair, young-due ids, prune, followed-channel poll list helper types.
- `src/lib/youtube/rss.ts` — RSS URL, Atom parse, fetch (0 quota).
- `src/lib/youtube/snapshot-poll.ts` — RSS + young `videos.list` poller.
- Tests: `tests/channels/stat-snapshots.test.ts`, `tests/channels/rss.test.ts`, `tests/channels/snapshot-poll.test.ts`.

**Modify**
- `src/lib/youtube/migrations.ts` — `video_stat_snapshots` DDL + idempotent backfill.
- `src/lib/youtube/channel-store.ts` — record snapshots inside upsert/update; `listFollowedForPoll()`.
- `src/lib/youtube/working-subject.ts` — ranking rewrite + snapshot velocity.
- `src/lib/youtube/video-queries.ts` — attach snapshot pairs; pass `velocityKind`.
- `src/lib/youtube/types.ts` — `velocityKind`, `formatId`, `jevNote` on `VideoListItem`.
- `src/lib/typesafe/client.ts` — `evaluateSystemOne` parses noul / choice / score (HTTP contract from https://docs.typesafe.ai/api.md).
- `src/lib/typesafe/rerank-titles.ts` — `jevTrendJudgments` (Choice + Score). Keep `jevClickNouls` for search. Delete `jevRisingHitNouls`.
- `src/lib/youtube/runtime.ts` — `snapshotPoll`, `lastSnapshotPollAt`.
- `src/lib/youtube/jobs.ts` — `queueSnapshotPoll`, wait on it.
- `src/app/api/channels/sync-stale/route.ts` — kick the poller.
- `src/components/library/followed-channels/view.ts` — `climbHint`.
- `src/components/library/followed-channels/TypesSummary.tsx` — honest empty + tile title.
- `src/components/library/FollowedChannelsSection.tsx` — section blurb no longer says « qui grimpent ».
- `tests/channels/fake-youtube.ts` — serve Atom RSS for known channels.
- Tests: `channel-tables`, `channel-store`, `working-subject`, `video-queries`, `view`, `followed-themes-ui`, `jobs`, `channels-routes`.

**Unchanged on purpose:** `api.ts` (`fetchVideos` already returns view/like), full 12 h playlist sync, keyword search `jevClickNouls`, `data/thumbgen.db`. Local `classifyVideoFormat` stays as the no-key fallback (not deleted).

**Optional later (Task 8, do not implement now):** `src/app/api/youtube/websub/route.ts` + hub subscribe.

---

### Task 1: `video_stat_snapshots` table

**Files:**
- Modify: `src/lib/youtube/migrations.ts`
- Modify: `tests/channels/channel-tables.test.ts`

**Interfaces:**
- Consumes: `migrateChannelTables(database)` already called from `src/lib/db.ts`.
- Produces: table `video_stat_snapshots` with columns `video_id`, `captured_at`, `view_count`, `like_count`; PK `(video_id, captured_at)`; FK to `channel_videos(video_id)` ON DELETE CASCADE; indexes `idx_video_stat_snapshots_video` and `idx_video_stat_snapshots_captured`; `backfillVideoStatSnapshots(database)` inserts one row from each `channel_videos` that has none.

- [ ] **Step 1: Write the failing test**

Add to `tests/channels/channel-tables.test.ts` (keep existing cases). Import nothing new beyond `getDb` / `migrateChannelTables` / `Database`.

```ts
  it("creates video_stat_snapshots with a cascade FK and backfills the latest row", () => {
    const db = getDb();
    expect(columns(db, "video_stat_snapshots")).toEqual(
      expect.arrayContaining(["video_id", "captured_at", "view_count", "like_count"]),
    );
    const indexes = (db.prepare("PRAGMA index_list(video_stat_snapshots)").all() as { name: string }[]).map(
      (index) => index.name,
    );
    expect(indexes).toEqual(
      expect.arrayContaining(["idx_video_stat_snapshots_video", "idx_video_stat_snapshots_captured"]),
    );

    db.prepare("DELETE FROM followed_channels").run();
    db.prepare(
      "INSERT INTO followed_channels (id, youtube_channel_id, title) VALUES ('snap-ch', 'UCsnap000000000000000001', 'Snap')",
    ).run();
    db.prepare(
      `INSERT INTO channel_videos (video_id, channel_id, title, published_at, thumbnail_url, stats_updated_at, view_count, like_count)
       VALUES ('snapvid0001', 'snap-ch', 'V', '2026-09-01T00:00:00.000Z', 'https://i.ytimg.com/vi/snapvid0001/mqdefault.jpg', '2026-09-10T00:00:00.000Z', 42, 7)`,
    ).run();
    migrateChannelTables(db);
    expect(
      db.prepare("SELECT video_id, captured_at, view_count, like_count FROM video_stat_snapshots WHERE video_id = 'snapvid0001'").all(),
    ).toEqual([{ video_id: "snapvid0001", captured_at: "2026-09-10T00:00:00.000Z", view_count: 42, like_count: 7 }]);

    db.prepare("DELETE FROM followed_channels WHERE id = 'snap-ch'").run();
    expect(db.prepare("SELECT COUNT(*) AS n FROM video_stat_snapshots WHERE video_id = 'snapvid0001'").get()).toEqual({ n: 0 });
  });
```

Also extend the existing « exist in the app database » case: `expect(columns(db, "video_stat_snapshots")).toEqual(expect.arrayContaining(["video_id", "captured_at", "view_count", "like_count"]))`.

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run tests/channels/channel-tables.test.ts`
Expected: FAIL (`no such table: video_stat_snapshots` or columns missing).

- [ ] **Step 3: Write minimal implementation**

In `src/lib/youtube/migrations.ts`, append to `CHANNEL_TABLES_DDL` (inside the same template string, after the `channel_videos` indexes):

```sql
  CREATE TABLE IF NOT EXISTS video_stat_snapshots (
    video_id     TEXT NOT NULL REFERENCES channel_videos(video_id) ON DELETE CASCADE,
    captured_at  TEXT NOT NULL,
    view_count   INTEGER NOT NULL DEFAULT 0,
    like_count   INTEGER,
    PRIMARY KEY (video_id, captured_at)
  );

  CREATE INDEX IF NOT EXISTS idx_video_stat_snapshots_video    ON video_stat_snapshots(video_id, captured_at);
  CREATE INDEX IF NOT EXISTS idx_video_stat_snapshots_captured ON video_stat_snapshots(captured_at);
```

Add and call from `migrateChannelTables` after the column-add loop:

```ts
export function backfillVideoStatSnapshots(database: Database.Database): void {
  database.exec(`
    INSERT OR IGNORE INTO video_stat_snapshots (video_id, captured_at, view_count, like_count)
    SELECT video_id, stats_updated_at, view_count, like_count
    FROM channel_videos
    WHERE NOT EXISTS (
      SELECT 1 FROM video_stat_snapshots s WHERE s.video_id = channel_videos.video_id
    )
  `);
}
```

`migrateChannelTables` already runs `database.exec(CHANNEL_TABLES_DDL)` first, so a brand-new in-memory DB in the « can run twice » test gets the table. The backfill is naturally idempotent (`INSERT OR IGNORE` + `NOT EXISTS`).

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run tests/channels/channel-tables.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/youtube/migrations.ts tests/channels/channel-tables.test.ts
git commit -m "feat: add 30-day video_stat_snapshots table"
```

Skip this commit when executing unless the human asked for git.

---

### Task 2: Snapshot store + write on upsert/update

**Files:**
- Create: `src/lib/youtube/stat-snapshots.ts`
- Create: `tests/channels/stat-snapshots.test.ts`
- Modify: `src/lib/youtube/channel-store.ts` (`upsertVideos`, `updateVideoStats`; add `listFollowedForPoll`)
- Modify: `tests/channels/channel-store.test.ts`

**Interfaces:**
- Consumes: `getDb()`, `VideoDetails`, `SNAPSHOT_RETENTION_DAYS = 30`, `SNAPSHOT_YOUNG_DAYS = 7`, `SNAPSHOT_YOUNG_INTERVAL_MS = 4 * 60 * 60 * 1000`.
- Produces:
  - `export type StatSnapshotPoint = { capturedAt: string; viewCount: number; likeCount: number | null }`
  - `export type SnapshotPair = { latest: StatSnapshotPoint; previous: StatSnapshotPoint | null }`
  - `insertStatSnapshots(rows: readonly { videoId: string; capturedAt: string; viewCount: number; likeCount: number | null }[]): void`
  - `latestSnapshotPairs(videoIds: readonly string[]): Map<string, SnapshotPair>`
  - `youngVideoIdsDueForSnapshot(now: Date, channelId?: string): string[]`
  - `pruneStatSnapshots(now: Date): number`
  - `listFollowedForPoll(): Array<{ id: string; youtubeChannelId: string; playlistId: string | null }>` (on the channel store)

- [ ] **Step 1: Write the failing test**

Create `tests/channels/stat-snapshots.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db";
import * as store from "@/lib/youtube/channel-store";
import {
  SNAPSHOT_RETENTION_DAYS,
  insertStatSnapshots,
  latestSnapshotPairs,
  pruneStatSnapshots,
  youngVideoIdsDueForSnapshot,
} from "@/lib/youtube/stat-snapshots";
import type { ChannelDetails, VideoDetails } from "@/lib/youtube/types";

const NOW = new Date("2026-09-19T12:00:00.000Z");
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000).toISOString();

const details = (letter: string): ChannelDetails => ({
  youtubeChannelId: `UC${letter.repeat(22)}`,
  title: `Chaîne ${letter}`,
  handle: null,
  avatarUrl: null,
  subscriberCount: null,
  videoCount: null,
});

const video = (videoId: string, overrides: Partial<VideoDetails> = {}): VideoDetails => ({
  videoId,
  title: videoId,
  publishedAt: hoursAgo(24),
  durationSeconds: 600,
  viewCount: 100,
  likeCount: 3,
  thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
  liveBroadcastContent: "none",
  ...overrides,
});

let channelId: string;

beforeEach(() => {
  getDb().exec("DELETE FROM followed_channels");
  channelId = store.insertChannel(details("s")).channel.id;
});

describe("insertStatSnapshots and latestSnapshotPairs", () => {
  it("keeps the last two relevés per video and ignores a duplicate stamp", () => {
    store.upsertVideos(channelId, [video("vid-1")], hoursAgo(10));
    insertStatSnapshots([{ videoId: "vid-1", capturedAt: hoursAgo(10), viewCount: 100, likeCount: 3 }]);
    insertStatSnapshots([
      { videoId: "vid-1", capturedAt: hoursAgo(4), viewCount: 180, likeCount: 4 },
      { videoId: "vid-1", capturedAt: hoursAgo(4), viewCount: 999, likeCount: 9 },
    ]);
    const pair = latestSnapshotPairs(["vid-1"]).get("vid-1");
    expect(pair).toEqual({
      latest: { capturedAt: hoursAgo(4), viewCount: 180, likeCount: 4 },
      previous: { capturedAt: hoursAgo(10), viewCount: 100, likeCount: 3 },
    });
  });
});

describe("pruneStatSnapshots", () => {
  it("drops rows older than 30 days and keeps younger ones", () => {
    store.upsertVideos(channelId, [video("vid-1")], hoursAgo(2));
    insertStatSnapshots([
      { videoId: "vid-1", capturedAt: new Date(NOW.getTime() - (SNAPSHOT_RETENTION_DAYS + 1) * 86_400_000).toISOString(), viewCount: 10, likeCount: null },
      { videoId: "vid-1", capturedAt: hoursAgo(2), viewCount: 20, likeCount: null },
    ]);
    expect(pruneStatSnapshots(NOW)).toBe(1);
    expect(latestSnapshotPairs(["vid-1"]).get("vid-1")).toMatchObject({
      latest: { viewCount: 20 },
      previous: null,
    });
  });
});

describe("youngVideoIdsDueForSnapshot", () => {
  it("lists 7-day videos with no snapshot or a snapshot older than 4 hours", () => {
    store.upsertVideos(channelId, [video("young-due", { publishedAt: hoursAgo(20) })], hoursAgo(5));
    store.upsertVideos(channelId, [video("young-fresh", { publishedAt: hoursAgo(10) })], hoursAgo(1));
    store.upsertVideos(channelId, [video("old", { publishedAt: hoursAgo(8 * 24) })], hoursAgo(5));
    expect(youngVideoIdsDueForSnapshot(NOW, channelId).sort()).toEqual(["young-due"]);
  });
});
```

Add to `tests/channels/channel-store.test.ts` inside the existing `videos` describe (it already has `channelId` + `upsertVideos`):

```ts
  it("writes a snapshot on upsert and on stats refresh, then deletes it with the video", () => {
    store.upsertVideos(channelId, [video("vid-1", { viewCount: 10, likeCount: 1 })], STAMP_1);
    store.updateVideoStats([video("vid-1", { viewCount: 22, likeCount: 2 })], STAMP_2);
    const rows = getDb()
      .prepare("SELECT captured_at, view_count, like_count FROM video_stat_snapshots WHERE video_id = 'vid-1' ORDER BY captured_at")
      .all();
    expect(rows).toEqual([
      { captured_at: STAMP_1, view_count: 10, like_count: 1 },
      { captured_at: STAMP_2, view_count: 22, like_count: 2 },
    ]);
    store.deleteVideos(["vid-1"]);
    expect(getDb().prepare("SELECT COUNT(*) AS n FROM video_stat_snapshots WHERE video_id = 'vid-1'").get()).toEqual({ n: 0 });
  });
```

(`getDb` is already imported in that file.)

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run tests/channels/stat-snapshots.test.ts tests/channels/channel-store.test.ts`
Expected: FAIL (`Cannot find module` / snapshots not written).

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/youtube/stat-snapshots.ts`:

```ts
import { getDb } from "@/lib/db";

export const SNAPSHOT_RETENTION_DAYS = 30;
export const SNAPSHOT_YOUNG_DAYS = 7;
export const SNAPSHOT_YOUNG_INTERVAL_MS = 4 * 60 * 60 * 1000;

export type StatSnapshotPoint = { capturedAt: string; viewCount: number; likeCount: number | null };

export type SnapshotPair = { latest: StatSnapshotPoint; previous: StatSnapshotPoint | null };

export type SnapshotRow = {
  videoId: string;
  capturedAt: string;
  viewCount: number;
  likeCount: number | null;
};

export function insertStatSnapshots(rows: readonly SnapshotRow[]): void {
  if (rows.length === 0) return;
  const statement = getDb().prepare(
    `INSERT OR IGNORE INTO video_stat_snapshots (video_id, captured_at, view_count, like_count)
     VALUES (@videoId, @capturedAt, @viewCount, @likeCount)`,
  );
  for (const row of rows) statement.run(row);
}

export function latestSnapshotPairs(videoIds: readonly string[]): Map<string, SnapshotPair> {
  const pairs = new Map<string, SnapshotPair>();
  if (videoIds.length === 0) return pairs;
  const placeholders = videoIds.map(() => "?").join(",");
  const rows = getDb()
    .prepare(
      `SELECT video_id AS videoId, captured_at AS capturedAt, view_count AS viewCount, like_count AS likeCount
       FROM video_stat_snapshots
       WHERE video_id IN (${placeholders})
       ORDER BY captured_at DESC`,
    )
    .all(...videoIds) as Array<{ videoId: string; capturedAt: string; viewCount: number; likeCount: number | null }>;
  for (const row of rows) {
    const point: StatSnapshotPoint = { capturedAt: row.capturedAt, viewCount: row.viewCount, likeCount: row.likeCount };
    const existing = pairs.get(row.videoId);
    if (!existing) pairs.set(row.videoId, { latest: point, previous: null });
    else if (!existing.previous) existing.previous = point;
  }
  return pairs;
}

export function youngVideoIdsDueForSnapshot(now: Date, channelId?: string): string[] {
  const youngStart = new Date(now.getTime() - SNAPSHOT_YOUNG_DAYS * 86_400_000).toISOString();
  const dueBefore = new Date(now.getTime() - SNAPSHOT_YOUNG_INTERVAL_MS).toISOString();
  const params: Array<string> = [youngStart, dueBefore];
  const channelClause = channelId ? " AND v.channel_id = ?" : "";
  if (channelId) params.push(channelId);
  const rows = getDb()
    .prepare(
      `SELECT v.video_id AS videoId
       FROM channel_videos v
       WHERE v.published_at >= ?
         AND (
           NOT EXISTS (SELECT 1 FROM video_stat_snapshots s WHERE s.video_id = v.video_id)
           OR (SELECT MAX(s.captured_at) FROM video_stat_snapshots s WHERE s.video_id = v.video_id) < ?
         )
         ${channelClause}
       ORDER BY v.published_at DESC`,
    )
    .all(...params) as { videoId: string }[];
  return rows.map((row) => row.videoId);
}

export function pruneStatSnapshots(now: Date): number {
  const cutoff = new Date(now.getTime() - SNAPSHOT_RETENTION_DAYS * 86_400_000).toISOString();
  return getDb().prepare("DELETE FROM video_stat_snapshots WHERE captured_at < ?").run(cutoff).changes;
}
```

**Note:** `upsertVideos` already inserts a snapshot (Task 2 wiring). The first test calls `upsertVideos` then `insertStatSnapshots` with the **same** stamp — `INSERT OR IGNORE` must keep the upsert row (view_count 100), not fail. The second explicit insert at `hoursAgo(4)` is the new point. Do **not** call `insertStatSnapshots` with the upsert stamp in a way that duplicates a different view count; the test’s first `insertStatSnapshots` of the same stamp is a no-op.

Wire `src/lib/youtube/channel-store.ts`:

1. Import `insertStatSnapshots, pruneStatSnapshots` from `./stat-snapshots`.
2. Inside `upsertVideos`’s transaction, after each `statement.run(...)`, also `insertStatSnapshots([{ videoId: video.videoId, capturedAt: stampIso, viewCount: video.viewCount, likeCount: video.likeCount }])`. After the transaction, `pruneStatSnapshots(new Date(stampIso))`.
3. Same pattern in `updateVideoStats`.
4. Add:

```ts
export function listFollowedForPoll(): Array<{ id: string; youtubeChannelId: string; playlistId: string | null }> {
  return getDb()
    .prepare(
      `SELECT id, youtube_channel_id AS youtubeChannelId, playlist_id AS playlistId
       FROM followed_channels
       ORDER BY is_mine DESC, created_at ASC`,
    )
    .all() as Array<{ id: string; youtubeChannelId: string; playlistId: string | null }>;
}
```

`youngVideoIdsDueForSnapshot` after an upsert: the just-written snapshot is fresh, so a video upserted at `hoursAgo(1)` is **not** due. A video upserted at `hoursAgo(5)` **is** due. The first test’s `upsertVideos(..., hoursAgo(10))` writes a snapshot at that stamp; `young-due` uses `hoursAgo(5)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run tests/channels/stat-snapshots.test.ts tests/channels/channel-store.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/youtube/stat-snapshots.ts src/lib/youtube/channel-store.ts tests/channels/stat-snapshots.test.ts tests/channels/channel-store.test.ts
git commit -m "feat: record view snapshots on followed-channel sync writes"
```

Skip when executing.

---

### Task 3: Honest velocity + Tendance ranking (pure)

**Files:**
- Modify: `src/lib/youtube/working-subject.ts`
- Modify: `tests/channels/working-subject.test.ts`

**Interfaces:**
- Consumes: `swipeRankKey`, `compareSwipeRank`, `ageInDays`, `performanceScore`, `median`, `WORKING_VIDEO_COUNT`, `StatSnapshotPoint` / `SnapshotPair` from `stat-snapshots.ts` (type-only is fine; do not import the store).
- Produces (replace the hard-gate behaviour):
  - `export type VelocityKind = "delta" | "average"`
  - `WorkingSubjectVideo.snapshots?: SnapshotPair | null`
  - `RisingHit` gains `velocityKind: VelocityKind`; `overperformance` becomes `number | null`; `velocity` becomes `number | null`
  - `resolveViewsPerHour(video, now): { viewsPerHour: number; kind: VelocityKind }`
  - `intervalViewsPerHour(previous, latest): number`
  - `trendRankKey(video, now): number | null`
  - `scoreTrendVideo(video, now): RisingHit | null` — null only if age ≥ 7 days **or** `viewCount === 0`
  - `scoreTrendVideos` (replace `scoreRisingHits`)
  - `pickTrendVideos` — global top N by rank, **no** channel-diversity pass
  - `workingSubjectWhy` gains `velocityKind: VelocityKind | null`
  - `rankRisingTrend` still the entry point used by tests
  - Remove `TREND_OVERPERF_MIN` and `TREND_VELOCITY_MIN` from the filter (delete the constants if unused)

- [ ] **Step 1: Write the failing tests**

Replace `tests/channels/working-subject.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import {
  TREND_SUBJECT_ID,
  hoursSincePublish,
  intervalViewsPerHour,
  pickTrendVideos,
  rankRisingTrend,
  resolveViewsPerHour,
  scoreTrendVideo,
  scoreTrendVideos,
  trendRankKey,
  viewsPerHour,
  workingOverperformance,
  workingSubjectWhy,
  type WorkingSubjectVideo,
} from "@/lib/youtube/working-subject";

const NOW = new Date("2026-09-19T12:00:00.000Z");
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000).toISOString();
const daysAgo = (days: number) => hoursAgo(days * 24);

const video = (
  partial: Pick<WorkingSubjectVideo, "videoId" | "channelId" | "title"> & Partial<WorkingSubjectVideo>,
): WorkingSubjectVideo => ({
  channelTitle: partial.channelTitle ?? partial.channelId,
  description: partial.description ?? "",
  publishedAt: partial.publishedAt ?? daysAgo(2),
  viewCount: partial.viewCount ?? 4_000,
  thumbnailUrl: `https://i.ytimg.com/vi/${partial.videoId}/mqdefault.jpg`,
  durationSeconds: partial.durationSeconds ?? 600,
  medianViews: partial.medianViews ?? 1_000,
  ...partial,
});

describe("hoursSincePublish", () => {
  it("floors at one hour so a brand-new row cannot explode VPH", () => {
    expect(hoursSincePublish(hoursAgo(0.1), NOW)).toBe(1);
    expect(hoursSincePublish(hoursAgo(48), NOW)).toBe(48);
  });
});

describe("resolveViewsPerHour", () => {
  it("uses the snapshot delta when two relevés exist, else the lifetime average", () => {
    const climbing = video({
      videoId: "hot",
      channelId: "a",
      title: "Hot",
      viewCount: 6_000,
      publishedAt: hoursAgo(48),
      snapshots: {
        latest: { capturedAt: hoursAgo(1), viewCount: 6_000, likeCount: 10 },
        previous: { capturedAt: hoursAgo(5), viewCount: 4_000, likeCount: 8 },
      },
    });
    expect(intervalViewsPerHour(climbing.snapshots!.previous!, climbing.snapshots!.latest)).toBe(500);
    expect(resolveViewsPerHour(climbing, NOW)).toEqual({ viewsPerHour: 500, kind: "delta" });
    expect(viewsPerHour(6_000, hoursAgo(48), NOW)).toBe(125);
    expect(resolveViewsPerHour(video({ videoId: "one", channelId: "a", title: "One", viewCount: 6_000, publishedAt: hoursAgo(48) }), NOW)).toEqual({
      viewsPerHour: 125,
      kind: "average",
    });
  });
});

describe("scoreTrendVideo ranking", () => {
  it("keeps a below-median 7-day video and drops only the dead and the old", () => {
    const flat = scoreTrendVideo(video({ videoId: "flat", channelId: "a", title: "Flat", viewCount: 1_000 }), NOW);
    expect(flat).not.toBeNull();
    expect(flat?.velocityKind).toBe("average");
    expect(scoreTrendVideo(video({ videoId: "zero", channelId: "a", title: "Zero", viewCount: 0 }), NOW)).toBeNull();
    expect(scoreTrendVideo(video({ videoId: "old", channelId: "a", title: "Old", viewCount: 80_000, publishedAt: daysAgo(20) }), NOW)).toBeNull();
  });

  it("ranks by swipe / overperformance, not by a velocity gate", () => {
    const smash = video({ videoId: "smash", channelId: "a", title: "Smash", viewCount: 6_000, publishedAt: hoursAgo(48) });
    const drip = video({ videoId: "drip", channelId: "a", title: "Drip", viewCount: 1_100, publishedAt: hoursAgo(144) });
    expect(workingOverperformance(smash)).toBe(6);
    expect(trendRankKey(smash, NOW)!).toBeGreaterThan(trendRankKey(drip, NOW)!);
  });
});

describe("workingSubjectWhy", () => {
  it("never claims ça grimpe on a lifetime average", () => {
    expect(
      workingSubjectWhy({ channelCount: 3, medianScore: 4.2, viewsPerHour: 180, velocityKind: "average" }),
    ).toBe("3 chaînes · ×4,2 vs médiane · moy. depuis publication · 180 vues/h · 7 j");
    expect(
      workingSubjectWhy({ channelCount: 2, medianScore: 4.2, viewsPerHour: 500, velocityKind: "delta" }),
    ).toBe("2 chaînes · ×4,2 vs médiane · ça grimpe · 500 vues/h · 7 j");
    expect(workingSubjectWhy({ channelCount: 1, medianScore: null, viewsPerHour: null, velocityKind: null })).toBe("1 chaîne · 7 j");
  });
});

describe("pickTrendVideos", () => {
  it("takes the global top 4 even when two come from the same channel, and does not pad", () => {
    const hits = scoreTrendVideos(
      [
        video({ videoId: "a-best", channelId: "a", title: "A smash", viewCount: 9_000, publishedAt: hoursAgo(40) }),
        video({ videoId: "a-mid", channelId: "a", title: "A mid", viewCount: 5_000, publishedAt: hoursAgo(36) }),
        video({ videoId: "b", channelId: "b", title: "B", viewCount: 4_000, medianViews: 1_000, publishedAt: hoursAgo(24) }),
        video({ videoId: "c", channelId: "c", title: "C", viewCount: 3_000, publishedAt: hoursAgo(20) }),
      ],
      NOW,
    );
    expect(pickTrendVideos(hits, 4).map((item) => item.videoId)).toEqual(["a-best", "a-mid", "b", "c"]);
    expect(pickTrendVideos(hits.slice(0, 2), 4)).toHaveLength(2);
  });
});

describe("rankRisingTrend", () => {
  it("returns the top performing 7-day followed videos, never a shared-subject cluster", () => {
    const { subject, suggested } = rankRisingTrend(
      [
        video({ videoId: "hot-a", channelId: "a", title: "Cursor smash", viewCount: 8_000, publishedAt: hoursAgo(36) }),
        video({ videoId: "hot-b", channelId: "b", title: "Claude smash", viewCount: 6_000, medianViews: 1_000, publishedAt: hoursAgo(24) }),
        video({ videoId: "old", channelId: "a", title: "Cursor archive", viewCount: 80_000, publishedAt: daysAgo(20) }),
        video({ videoId: "slow", channelId: "c", title: "Cursor drip", viewCount: 1_100, publishedAt: hoursAgo(160) }),
        video({ videoId: "under", channelId: "d", title: "Under", viewCount: 400, publishedAt: hoursAgo(12) }),
        video({ videoId: "dead", channelId: "e", title: "Dead", viewCount: 0, publishedAt: hoursAgo(6) }),
      ],
      NOW,
    );
    expect(subject?.subjectId).toBe(TREND_SUBJECT_ID);
    expect(subject?.label).toBe("En hausse");
    expect(subject?.why).toMatch(/moy\. depuis publication/);
    expect(subject?.why).not.toMatch(/ça grimpe/);
    expect(suggested.map((item) => item.videoId)).toEqual(["hot-a", "hot-b", "slow", "under"]);
    expect(suggested).toHaveLength(4);
  });

  it("still returns a lonely below-median video when it is the only 7-day row", () => {
    const { subject, suggested } = rankRisingTrend(
      [video({ videoId: "only", channelId: "a", title: "Median", viewCount: 1_000 })],
      NOW,
    );
    expect(suggested.map((item) => item.videoId)).toEqual(["only"]);
    expect(subject?.channelCount).toBe(1);
  });

  it("labels ça grimpe only when every picked tile has a delta", () => {
    const { subject, suggested } = rankRisingTrend(
      [
        video({
          videoId: "d1",
          channelId: "a",
          title: "Delta one",
          viewCount: 8_000,
          publishedAt: hoursAgo(36),
          snapshots: {
            latest: { capturedAt: hoursAgo(1), viewCount: 8_000, likeCount: null },
            previous: { capturedAt: hoursAgo(5), viewCount: 5_000, likeCount: null },
          },
        }),
        video({
          videoId: "d2",
          channelId: "b",
          title: "Delta two",
          viewCount: 6_000,
          publishedAt: hoursAgo(24),
          snapshots: {
            latest: { capturedAt: hoursAgo(1), viewCount: 6_000, likeCount: null },
            previous: { capturedAt: hoursAgo(5), viewCount: 4_000, likeCount: null },
          },
        }),
      ],
      NOW,
    );
    expect(suggested.every((item) => item.velocityKind === "delta")).toBe(true);
    expect(subject?.why).toMatch(/ça grimpe/);
    expect(subject?.why).not.toMatch(/moy\. depuis publication/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run tests/channels/working-subject.test.ts`
Expected: FAIL (`scoreTrendVideo` / `resolveViewsPerHour` not exported; old gates still drop `under` / `slow`).

- [ ] **Step 3: Write minimal implementation**

Rewrite `src/lib/youtube/working-subject.ts` as follows (keep the file’s existing helpers `hoursSincePublish`, `viewsPerHour`, `channelTypicalVph`, `workingOverperformance`, `trendVelocity`, `trendRank`, `TREND_WINDOW_DAYS`, `TREND_MATURE_HOURS`, `TREND_SUBJECT_ID`).

Add imports:

```ts
import { ageInDays, median, performanceScore } from "./performance";
import { compareSwipeRank, swipeRankKey } from "./swipe-rank";
import type { SnapshotPair, StatSnapshotPoint } from "./stat-snapshots";
import { WORKING_VIDEO_COUNT } from "./types";
```

Replace the file header comment with:

```ts
/**
 * « 🏆 Tendance Youtube » — rank every followed video from the last 7 days.
 * Not a shared-topic cluster. Not a velocity-gated subset.
 * Rank = swipeRankKey(views ÷ channel median), log2(views) if no median.
 * « ça grimpe » is a label from snapshot deltas (≥2 relevés), never a hard exclude.
 * TypeSafe Jev does not compute any of this; it only nudges titles afterwards.
 */
```

Extend types:

```ts
export type VelocityKind = "delta" | "average";

export type WorkingSubjectVideo = {
  videoId: string;
  channelId: string;
  channelTitle: string;
  title: string;
  description?: string | null;
  publishedAt: string;
  viewCount: number;
  thumbnailUrl: string;
  durationSeconds: number;
  medianViews: number | null;
  snapshots?: SnapshotPair | null;
};

export type RisingHit = WorkingSubjectVideo & {
  overperformance: number | null;
  viewsPerHour: number;
  velocityKind: VelocityKind;
  velocity: number | null;
  rank: number;
};
```

Add:

```ts
export function intervalViewsPerHour(previous: StatSnapshotPoint, latest: StatSnapshotPoint): number {
  const started = Date.parse(previous.capturedAt);
  const ended = Date.parse(latest.capturedAt);
  const hours = Number.isFinite(started) && Number.isFinite(ended) ? (ended - started) / 3_600_000 : 1;
  return (latest.viewCount - previous.viewCount) / Math.max(1, hours);
}

export function resolveViewsPerHour(
  video: Pick<WorkingSubjectVideo, "viewCount" | "publishedAt" | "snapshots">,
  now: Date,
): { viewsPerHour: number; kind: VelocityKind } {
  const previous = video.snapshots?.previous;
  const latest = video.snapshots?.latest;
  if (previous && latest) return { viewsPerHour: intervalViewsPerHour(previous, latest), kind: "delta" };
  return { viewsPerHour: viewsPerHour(video.viewCount, video.publishedAt, now), kind: "average" };
}

export function trendRankKey(video: Pick<WorkingSubjectVideo, "viewCount" | "medianViews" | "publishedAt">, now: Date): number | null {
  if (!(video.viewCount > 0)) return null;
  const swipe = swipeRankKey({
    score: workingOverperformance(video),
    ageDays: ageInDays(video.publishedAt, now),
    viewCount: video.viewCount,
  });
  if (swipe !== null) return swipe;
  return Math.log2(video.viewCount);
}

export function scoreTrendVideo(video: WorkingSubjectVideo, now: Date): RisingHit | null {
  if (ageInDays(video.publishedAt, now) >= TREND_WINDOW_DAYS) return null;
  if (!(video.viewCount > 0)) return null;
  const rank = trendRankKey(video, now);
  if (rank === null) return null;
  const resolved = resolveViewsPerHour(video, now);
  const typical = video.medianViews === null ? null : channelTypicalVph(video.medianViews);
  return {
    ...video,
    overperformance: workingOverperformance(video),
    viewsPerHour: resolved.viewsPerHour,
    velocityKind: resolved.kind,
    velocity: typical && typical > 0 ? resolved.viewsPerHour / typical : null,
    rank,
  };
}

export function scoreTrendVideos(videos: readonly WorkingSubjectVideo[], now: Date = new Date()): RisingHit[] {
  return videos.flatMap((video) => {
    const hit = scoreTrendVideo(video, now);
    return hit ? [hit] : [];
  });
}
```

`pickTrendVideos`: sort with existing `compareHits` (rank desc, then newer), `return ranked.slice(0, limit)` — delete the `seenChannel` loop.

`workingSubjectWhy`: add `velocityKind: VelocityKind | null`. After the median-score part, if `velocityKind === "delta"` push `"ça grimpe"`; else if `velocityKind === "average"` push `"moy. depuis publication"`.

`buildTrendSubject`:

```ts
  const climbKind =
    hits.length > 0 && hits.every((hit) => hit.velocityKind === "delta") ? "delta" : hits.length > 0 ? "average" : null;
  const scores = hits.map((hit) => hit.overperformance).filter((score): score is number => score !== null);
```

Pass `velocityKind: climbKind` into `workingSubjectWhy`. Keep `label: "En hausse"`.

`rankRisingTrend` uses `scoreTrendVideos` + `pickTrendVideos`.

Delete `isRisingHit` and `scoreRisingHits` (or re-export `scoreTrendVideos as scoreRisingHits` only if a forgotten import remains — prefer a clean rename). Delete `TREND_OVERPERF_MIN` and `TREND_VELOCITY_MIN`.

Keep `trendVelocity` as the lifetime-average helper (used by older comments / optional tests) or delete it if nothing imports it. After this task, grep the repo: if unused, delete.

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run tests/channels/working-subject.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/youtube/working-subject.ts tests/channels/working-subject.test.ts
git commit -m "feat: rank Tendance Youtube as top 4 followed 7-day videos"
```

Skip when executing.

---

### Task 3b: TypeSafe Choice (format) + Score (note)

**Files:**
- Modify: `src/lib/typesafe/client.ts`
- Modify: `src/lib/typesafe/rerank-titles.ts`
- Modify: `tests/typesafe/rerank-titles.test.ts`

**Interfaces:**
- Consumes: HTTP `POST https://api.typesafe.ai/v1/systemone` (same as `evaluateNouls`). Choice/Score shapes from https://docs.typesafe.ai/api.md. Format ids from `VIDEO_FORMATS` + `other`.
- Produces:
  - `evaluateSystemOne(apiKey, state, questions): Promise<Record<string, SystemOneAnswer>>`
  - `jevTrendJudgments(videos: readonly TrendJudgmentInput[]): Promise<Map<string, TrendJudgment>>`
  - `TrendJudgmentInput = { videoId, title, description, durationSeconds, overperformance, viewsPerHour, velocityKind }`
  - `TrendJudgment = { formatId: VideoFormatId; note: number; score01: number }`
  - `TREND_SCORE_CRITERIA`: 5 level strings. `note = round((score/4)*10 * 10)/10`. `score01 = score/4` for `applyJevNudge`.
  - Deletes `jevRisingHitNouls`.
  - `jevClickNouls` unchanged.

- [ ] **Step 1: Write the failing tests**

Replace the `jevRisingHitNouls` describe in `tests/typesafe/rerank-titles.test.ts` with:

```ts
describe("jevTrendJudgments", () => {
  it("returns an empty map without a key and does not call TypeSafe", async () => {
    const { jevTrendJudgments } = await import("@/lib/typesafe/rerank-titles");
    expect(await jevTrendJudgments([{ videoId: "aaaaaaaaaaa", title: "Tuto Cursor", description: "", durationSeconds: 600, overperformance: 4, viewsPerHour: 80, velocityKind: "average" }])).toEqual(new Map());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("asks Choice for format and Score for a note, passing ×N as context not as a calculation", async () => {
    setSetting("typesafeApiKey", "tsk-test");
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          answers: {
            fmt_0: { type: "choice", choice: "tutorial", confidence: 0.9 },
            note_0: { type: "score", score: 3.2, confidence: 0.8 },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const { jevTrendJudgments } = await import("@/lib/typesafe/rerank-titles");
    const judged = await jevTrendJudgments([
      { videoId: "aaaaaaaaaaa", title: "Tuto Cursor", description: "Pas à pas", durationSeconds: 600, overperformance: 4.2, viewsPerHour: 180, velocityKind: "delta" },
    ]);
    expect(judged.get("aaaaaaaaaaa")).toEqual({ formatId: "tutorial", note: 8, score01: 0.8 });
    const body = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.body));
    expect(body.questions.fmt_0.type).toBe("choice");
    expect(body.questions.fmt_0.criteria.tutorial).toBeTruthy();
    expect(body.questions.fmt_0.criteria.other).toBeTruthy();
    expect(body.questions.note_0.type).toBe("score");
    expect(body.questions.note_0.criteria).toHaveLength(5);
    expect(body.state.videos.v0.overperformance).toBe(4.2);
    expect(body.questions.note_0.instructions).toMatch(/already computed|déjà calcul/i);
    expect(JSON.stringify(body.questions)).not.toMatch(/views ÷|calculate overperf|compute velocity/i);
    expect(JSON.stringify(body)).not.toMatch(/https?:|thumbnail|mqdefault|\.jpg|image\//i);
  });

  it("returns an empty map when TypeSafe fails", async () => {
    setSetting("typesafeApiKey", "tsk-test");
    fetchMock.mockRejectedValue(new Error("down"));
    const { jevTrendJudgments } = await import("@/lib/typesafe/rerank-titles");
    expect(
      await jevTrendJudgments([
        { videoId: "aaaaaaaaaaa", title: "Hello", description: "", durationSeconds: 600, overperformance: 1, viewsPerHour: 10, velocityKind: "average" },
      ]),
    ).toEqual(new Map());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run tests/typesafe/rerank-titles.test.ts`
Expected: FAIL (`jevTrendJudgments` missing).

- [ ] **Step 3: Write minimal implementation**

`src/lib/typesafe/client.ts` — add (keep `evaluateNouls`):

```ts
export type ChoiceQuestion = { type: "choice"; instructions: string; criteria: Record<string, string | null> };
export type ScoreQuestion = { type: "score"; instructions: string; criteria: readonly string[] };
export type SystemOneQuestion = NoulQuestion | ChoiceQuestion | ScoreQuestion;
export type SystemOneAnswer =
  | { type: "noul"; noul: number }
  | { type: "choice"; choice: string; confidence?: number }
  | { type: "score"; score: number; confidence?: number };

export async function evaluateSystemOne(
  apiKey: string,
  state: unknown,
  questions: Record<string, SystemOneQuestion>,
  signal?: AbortSignal,
): Promise<Record<string, SystemOneAnswer>> {
  const res = await fetch(TYPESAFE_SYSTEMONE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "User-Agent": THUMBGEN_USER_AGENT,
    },
    body: JSON.stringify({ state, model: TYPESAFE_MODEL, questions }),
    signal,
  });
  if (!res.ok) throw new Error(`TypeSafe HTTP ${res.status}`);
  const body = (await res.json()) as { answers?: Record<string, Record<string, unknown>> };
  const answers: Record<string, SystemOneAnswer> = {};
  for (const [id, answer] of Object.entries(body.answers ?? {})) {
    if (answer.type === "noul" && typeof answer.noul === "number") answers[id] = { type: "noul", noul: answer.noul };
    else if (answer.type === "choice" && typeof answer.choice === "string") {
      answers[id] = { type: "choice", choice: answer.choice, confidence: typeof answer.confidence === "number" ? answer.confidence : undefined };
    } else if (answer.type === "score" && typeof answer.score === "number") {
      answers[id] = { type: "score", score: answer.score, confidence: typeof answer.confidence === "number" ? answer.confidence : undefined };
    }
  }
  return answers;
}
```

`src/lib/typesafe/rerank-titles.ts` — add `jevTrendJudgments`, delete `jevRisingHitNouls`. Choice criteria: each `VIDEO_FORMATS` label as description + `other: "None of the named formats fit."`. Score criteria: the 5 strings above. State:

```ts
{ videos: { v0: { title, description, durationSeconds, overperformance, viewsPerHour, velocityKind } } }
```

Score instructions (English, matching existing Jev copy): `How strong is videos.v0 as a swipe-file thumbnail package? facts.overperformance and facts.viewsPerHour on that object are already computed by code — do not recalculate views, ×N, or velocity. Judge title and description packaging only.`

`note = Math.round((score / 4) * 10 * 10) / 10` — for score 3.2 → 8. `score01 = score / 4` clamped to [0,1]. Invalid format choice → omit format (caller falls back) or map to `other`.

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run tests/typesafe/rerank-titles.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/typesafe/client.ts src/lib/typesafe/rerank-titles.ts tests/typesafe/rerank-titles.test.ts
git commit -m "feat: TypeSafe format Choice and swipe-package Score"
```

Skip when executing.

---

### Task 4: Wire queries, DTO, Jev judgments

**Files:**
- Modify: `src/lib/youtube/video-queries.ts`
- Modify: `src/lib/youtube/types.ts`
- Modify: `tests/channels/video-queries.test.ts`

**Interfaces:**
- Consumes: `scoreTrendVideos`, `pickTrendVideos`, `latestSnapshotPairs`, `jevTrendJudgments`, `classifyVideoFormat`, `applyJevNudge`.
- Produces: `VideoListItem.velocityKind`, `formatId`, `jevNote`; `workingSubject()` attaches snapshots, scores in **code**, then TypeSafe Choice+Score on the numeric shortlist. Jev never receives a view-count pile.

- [x] **Step 1: Write the failing tests**

Mock `jevTrendJudgments` (not `jevRisingHitNouls` — that function is deleted). In `tests/channels/video-queries.test.ts`, the `workingSubject` describe is:

```ts
describe("workingSubject", () => {
  it("returns the top 7-day followed videos by performance, including a below-median row", async () => {
    addVideo(otherId, "o-hot", 1, 40_000, null, "Claude smash");
    const result = await workingSubject(NOW);
    expect(result.period).toBe("7d");
    expect(result.jevUsed).toBe(false);
    expect(result.subject?.subjectId).toBe("tendance");
    expect(result.subject?.why).toMatch(/moy\. depuis publication/);
    expect(result.videos.map((item) => item.videoId)).toEqual(["o-hot", "m-recent", "o-new"]);
    expect(result.videos.length).toBeLessThanOrEqual(4);
    expect(result.videos.every((item) => item.velocityKind === "average")).toBe(true);
    expect(jevTrendJudgments).toHaveBeenCalled();
  });

  it("still returns a single 7-day video that does not beat the median", async () => {
    getDb().exec("DELETE FROM channel_videos");
    addVideo(otherId, "o-drip", 2, 900, null, "Under median");
    const result = await workingSubject(NOW);
    expect(result.videos.map((item) => item.videoId)).toEqual(["o-drip"]);
    expect(result.subject?.channelCount).toBe(1);
    expect(result.jevUsed).toBe(false);
  });

  it("attaches mocked Jev format and note without asking Jev to compute ×N", async () => {
    addVideo(otherId, "o-hot", 1, 40_000, null, "Claude smash");
    jevTrendJudgments.mockResolvedValueOnce(
      new Map([
        ["m-recent", { formatId: "tutorial", note: 9, score01: 0.99 }],
        ["o-hot", { formatId: "commentary", note: 2, score01: 0.01 }],
      ]),
    );
    const nudged = await workingSubject(NOW);
    expect(nudged.jevUsed).toBe(true);
    expect(nudged.videos.find((item) => item.videoId === "m-recent")).toMatchObject({
      formatId: "tutorial",
      jevNote: 9,
    });
    expect(jevTrendJudgments.mock.calls[0]?.[0]).toEqual(
      expect.arrayContaining([expect.objectContaining({ videoId: "o-hot", overperformance: 4 })]),
    );

    const numeric = await workingSubject(NOW);
    expect(numeric.jevUsed).toBe(false);
    expect(numeric.videos.map((item) => item.videoId)).toEqual(["o-hot", "m-recent", "o-new"]);
  });

  it("uses snapshot deltas for velocityKind when two relevés exist", async () => {
    getDb().exec("DELETE FROM channel_videos");
    addVideo(mineId, "m-climb", 1, 8_000, null, "Climbing");
    getDb()
      .prepare(
        `INSERT INTO video_stat_snapshots (video_id, captured_at, view_count, like_count)
         VALUES ('m-climb', '2026-09-16T07:00:00.000Z', 3000, NULL)`,
      )
      .run();
    const result = await workingSubject(NOW);
    expect(result.videos[0]).toMatchObject({ videoId: "m-climb", velocityKind: "delta" });
    expect(result.subject?.why).toMatch(/ça grimpe/);
  });
});
```

`addVideo` already calls `upsertVideos` at `NOW`, which writes a snapshot at `2026-09-16T12:00:00.000Z`. The extra older row gives a pair. `NOW` in this file is `2026-09-16T12:00:00.000Z`.

The mocked payload sent to `jevTrendJudgments` must include `overperformance` / `viewsPerHour` / `velocityKind` already computed. Do **not** reintroduce `jevRisingHitNouls`.

- [x] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run tests/channels/video-queries.test.ts`
Expected: FAIL (`jevTrendJudgments` / `velocityKind` missing if Task 3b is not wired).

- [x] **Step 3: Write minimal implementation**

`src/lib/youtube/types.ts` — on `VideoListItem`:

```ts
  overperformance?: number | null;
  viewsPerHour?: number | null;
  velocityKind?: "delta" | "average";
  formatId?: VideoFormatId;
  jevNote?: number | null;
```

`src/lib/youtube/video-queries.ts`:

- Import `scoreTrendVideos`, `latestSnapshotPairs`, `jevTrendJudgments`, `classifyVideoFormat`, `applyJevNudge`.
- After building `pool`, attach `latestSnapshotPairs`.
- `const qualified = scoreTrendVideos(pool, now)`.
- Call `jevTrendJudgments` on `pickTrendVideos(qualified, SWIPE_RERANK_TOP)` with title, description, durationSeconds, and the **already-computed** `overperformance` / `viewsPerHour` / `velocityKind`.
- Apply `formatId` + `jevNote` from the judgment; `applyJevNudge(hit.rank, judged.score01)` only. Missing judgment → `classifyVideoFormat` fallback, no note.
- `pickTrendVideos(qualified)` again after the nudge; map DTO fields including `formatId` and `jevNote`.

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run tests/channels/video-queries.test.ts tests/channels/working-subject.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/youtube/video-queries.ts src/lib/youtube/types.ts src/lib/typesafe/rerank-titles.ts tests/channels/video-queries.test.ts
git commit -m "feat: attach snapshot velocity to Tendance Youtube queries"
```

Skip when executing.

---

### Task 5: Honest Tendance UI

**Files:**
- Modify: `src/components/library/followed-channels/view.ts`
- Modify: `src/components/library/followed-channels/TypesSummary.tsx`
- Modify: `src/components/library/FollowedChannelsSection.tsx`
- Modify: `tests/channels/view.test.ts`
- Modify: `tests/library/followed-themes-ui.test.tsx`

**Interfaces:**
- Consumes: `VideoListItem.velocityKind`, `overperformance`, `formatId`, `jevNote`, `workingSubjectWhy` strings from Tasks 3–4.
- Produces: `climbHint`; `performanceBandLabel` (`Surperforme` / `Dans la moyenne` / `Sous-performe`); empty hero copy without « grimpe »; section blurb without « qui grimpent »; tile shows format + note + band words; tile `title={climbHint(...)}`.

- [ ] **Step 1: Write the failing tests**

In `tests/channels/view.test.ts` add `climbHint` to the import and:

```ts
describe("climbHint", () => {
  it("does not call a lifetime average a climb", () => {
    expect(climbHint("average")).toBe("Moyenne depuis la publication (un seul relevé)");
    expect(climbHint("delta")).toBe("Ça grimpe : écart de vues entre deux relevés");
  });
});
```

In `tests/library/followed-themes-ui.test.tsx`:
- Change the fixture `why` to `"3 chaînes · ×4,2 vs médiane · moy. depuis publication · 180 vues/h · 7 j"` and the two-video why similarly.
- Update the `toContain` assertions to those strings.
- Add a case: `workingSubject.mockResolvedValue({ period: "7d", subject: null, videos: [], jevUsed: false })` then expect `Aucune vidéo publiée ces 7 derniers jours sur tes chaînes suivies.` and **not** `grimpe assez fort`.
- On a dedicated case, render tiles with `overperformance` 4.2 / 1.1 / 0.3, `formatId` tutorial, `jevNote` 8.2: expect `Tutoriel`, `8,2/10`, `Surperforme`, `Dans la moyenne`, `Sous-performe`. Tile `title` = `climbHint("average")`.
- `VideoInfoDialog` prefers `overperformance` (not the 7-day `performance.kind === "recent"`) so a Tendance tile does not say « trop tôt pour un ×N ». Caption = `performanceBandLabel`. Use `video.formatId` when present; show `jevNote` if set.

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run tests/channels/view.test.ts tests/library/followed-themes-ui.test.tsx`
Expected: FAIL (`climbHint` missing; old empty copy).

- [ ] **Step 3: Write minimal implementation**

`view.ts`:

```ts
export function climbHint(kind: "delta" | "average"): string {
  return kind === "delta" ? "Ça grimpe : écart de vues entre deux relevés" : "Moyenne depuis la publication (un seul relevé)";
}
```

`view.ts` also export:

```ts
export function performanceBandLabel(band: "over" | "neutral" | "under"): string {
  return band === "over" ? "Surperforme" : band === "under" ? "Sous-performe" : "Dans la moyenne";
}
```

`TypesSummary.tsx`:
- Empty branch text: `Aucune vidéo publiée ces 7 derniers jours sur tes chaînes suivies.`
- On the `<button>`, set `title={video.velocityKind ? climbHint(video.velocityKind) : undefined}` (import `climbHint`).
- Show format label, `formatJevNote` when `jevNote` is set, and `performanceBandLabel(performanceBand(overperformance))` as visible text.
- Do **not** add a subtitle under `CardTitle`. Heading stays `🏆 Tendance Youtube`.

`VideoInfoDialog.tsx`: `coteLine` uses `overperformance` first; caption is the band word. Format from `formatId` else local classifier.

`FollowedChannelsSection.tsx` replace the muted paragraph:

```tsx
          Les 4 vidéos qui performent le plus sur tes chaînes suivies (7 jours), puis le swipe. Le type de vidéo se
          filtre à part.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run tests/channels/view.test.ts tests/library/followed-themes-ui.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/library/followed-channels/view.ts src/components/library/followed-channels/TypesSummary.tsx src/components/library/FollowedChannelsSection.tsx tests/channels/view.test.ts tests/library/followed-themes-ui.test.tsx
git commit -m "fix: label Tendance Youtube climb vs lifetime average"
```

Skip when executing.

---

### Task 6: YouTube RSS parse + fake

**Files:**
- Create: `src/lib/youtube/rss.ts`
- Create: `tests/channels/rss.test.ts`
- Modify: `tests/channels/fake-youtube.ts`

**Interfaces:**
- Consumes: `YOUTUBE_FETCH_TIMEOUT_MS`, `youtubeNetworkError` from `api.ts`.
- Produces:
  - `youtubeRssUrl(youtubeChannelId: string): string` → `https://www.youtube.com/feeds/videos.xml?channel_id=…`
  - `parseYoutubeRss(xml: string): string[]` — unique `yt:videoId` in document order
  - `fetchYoutubeRss(youtubeChannelId: string): Promise<string[]>` — network/timeout → throw `youtubeNetworkError()`; HTTP not-ok → `[]`

- [ ] **Step 1: Write the failing test**

Create `tests/channels/rss.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { YouTubeApiError } from "@/lib/youtube/api";
import { fetchYoutubeRss, parseYoutubeRss, youtubeRssUrl } from "@/lib/youtube/rss";

const FEED = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns="http://www.w3.org/2005/Atom">
  <entry><yt:videoId>aaa11111111</yt:videoId></entry>
  <entry><yt:videoId>bbb22222222</yt:videoId></entry>
  <entry><yt:videoId>aaa11111111</yt:videoId></entry>
</feed>`;

describe("youtubeRssUrl", () => {
  it("points at the public channel Atom feed", () => {
    expect(youtubeRssUrl("UCabcdefghijabcdefghij")).toBe(
      "https://www.youtube.com/feeds/videos.xml?channel_id=UCabcdefghijabcdefghij",
    );
  });
});

describe("parseYoutubeRss", () => {
  it("returns unique yt:videoId values in document order", () => {
    expect(parseYoutubeRss(FEED)).toEqual(["aaa11111111", "bbb22222222"]);
    expect(parseYoutubeRss("<feed></feed>")).toEqual([]);
  });
});

describe("fetchYoutubeRss", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("parses a 200 Atom body and treats a 404 as no ids", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("missing")) return new Response("gone", { status: 404 });
      return new Response(FEED, { status: 200, headers: { "content-type": "application/atom+xml" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    expect(await fetchYoutubeRss("UCabcdefghijabcdefghij")).toEqual(["aaa11111111", "bbb22222222"]);
    expect(await fetchYoutubeRss("UCmissingmissingmissing")).toEqual([]);
  });

  it("maps a network failure to YouTubeApiError", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("fetch failed");
    }));
    await expect(fetchYoutubeRss("UCabcdefghijabcdefghij")).rejects.toBeInstanceOf(YouTubeApiError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run tests/channels/rss.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/youtube/rss.ts`:

```ts
import { YOUTUBE_FETCH_TIMEOUT_MS, youtubeNetworkError } from "./api";

const VIDEO_ID = /<yt:videoId>\s*([\w-]{1,15})\s*<\/yt:videoId>/g;

export function youtubeRssUrl(youtubeChannelId: string): string {
  return `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(youtubeChannelId)}`;
}

export function parseYoutubeRss(xml: string): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const match of xml.matchAll(VIDEO_ID)) {
    const videoId = match[1];
    if (!videoId || seen.has(videoId)) continue;
    seen.add(videoId);
    ids.push(videoId);
  }
  return ids;
}

export async function fetchYoutubeRss(youtubeChannelId: string): Promise<string[]> {
  let res: Response;
  try {
    res = await fetch(youtubeRssUrl(youtubeChannelId), {
      signal: AbortSignal.timeout(YOUTUBE_FETCH_TIMEOUT_MS),
      headers: { accept: "application/atom+xml, application/xml, text/xml" },
    });
  } catch {
    throw youtubeNetworkError();
  }
  if (!res.ok) return [];
  return parseYoutubeRss(await res.text());
}
```

In `tests/channels/fake-youtube.ts`, **before** `if (url.hostname !== "www.googleapis.com")`, handle Atom:

```ts
    if (url.hostname === "www.youtube.com" && url.pathname === "/feeds/videos.xml") {
      const channelId = url.searchParams.get("channel_id") ?? "";
      const list = videos
        .filter((video) => video.channelId === channelId)
        .sort((left, right) => right.publishedAt.localeCompare(left.publishedAt));
      const body = `<?xml version="1.0" encoding="UTF-8"?><feed xmlns:yt="http://www.youtube.com/xml/schemas/2015">${list
        .map((video) => `<entry><yt:videoId>${video.id}</yt:videoId></entry>`)
        .join("")}</feed>`;
      return new Response(body, { status: 200, headers: { "content-type": "application/atom+xml" } });
    }
```

Do not push these requests into `calls` (that array is YouTube Data API quota accounting). RSS is 0 quota.

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run tests/channels/rss.test.ts tests/channels/youtube-api.test.ts tests/channels/sync.test.ts tests/channels/jobs.test.ts`
Expected: PASS (fake change must not break API tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/youtube/rss.ts tests/channels/rss.test.ts tests/channels/fake-youtube.ts
git commit -m "feat: parse YouTube channel RSS for new followed uploads"
```

Skip when executing.

---

### Task 7: Lightweight poller + app-open kick

**Files:**
- Create: `src/lib/youtube/snapshot-poll.ts`
- Create: `tests/channels/snapshot-poll.test.ts`
- Modify: `src/lib/youtube/runtime.ts`
- Modify: `src/lib/youtube/jobs.ts`
- Modify: `src/app/api/channels/sync-stale/route.ts`
- Modify: `tests/channels/jobs.test.ts` (waitForChannelJobs still drains; no RSS from `queueChannelSyncs`)

**Interfaces:**
- Consumes: `fetchYoutubeRss`, `fetchVideos`, `keepVideo`, `listFollowedForPoll`, `knownVideoIds`, `upsertVideos`, `updateVideoStats`, `youngVideoIdsDueForSnapshot`, `pruneStatSnapshots`, `getTypedSettings().youtubeApiKey`, channel lock, quota block.
- Produces:
  - `RSS_POLL_THROTTLE_MS = 15 * 60 * 1000`
  - `pollFollowedSnapshots(now?: () => Date): Promise<{ rssNew: number; refreshed: number; status: "done" | "no-key" | "quota" | "error" }>`
  - `queueSnapshotPoll(options?: { now?: Date; force?: boolean }): { started: boolean; throttled: boolean }`
  - `waitForChannelJobs` also awaits `runtime.snapshotPoll`

- [ ] **Step 1: Write the failing test**

Create `tests/channels/snapshot-poll.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/lib/db";
import { setSetting } from "@/lib/settings";
import * as store from "@/lib/youtube/channel-store";
import { queueSnapshotPoll, waitForChannelJobs } from "@/lib/youtube/jobs";
import { acquireChannelLock, markQuotaBlocked, releaseChannelLock, resetChannelRuntime } from "@/lib/youtube/runtime";
import { latestSnapshotPairs } from "@/lib/youtube/stat-snapshots";
import { pollFollowedSnapshots } from "@/lib/youtube/snapshot-poll";
import type { VideoDetails } from "@/lib/youtube/types";
import { channelIdFor, createFakeYouTube, type FakeYouTube } from "./fake-youtube";

const A = channelIdFor("a");
const NOW = new Date("2026-09-19T12:00:00.000Z");
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000).toISOString();
let fake: FakeYouTube;
let channelId: string;

const known: VideoDetails = {
  videoId: "oldvid00001",
  title: "Old",
  publishedAt: hoursAgo(20),
  durationSeconds: 600,
  viewCount: 100,
  likeCount: 1,
  thumbnailUrl: "https://i.ytimg.com/vi/oldvid00001/mqdefault.jpg",
  liveBroadcastContent: "none",
};

beforeEach(() => {
  getDb().exec("DELETE FROM followed_channels");
  getDb().exec("DELETE FROM settings");
  setSetting("youtubeApiKey", "test-yt-key");
  resetChannelRuntime();
  fake = createFakeYouTube({
    channels: [{ id: A, handle: "@a", title: "A", hasLongFormPlaylist: true }],
    videos: [
      { id: "oldvid00001", channelId: A, publishedAt: hoursAgo(20), views: 220, title: "Old" },
      { id: "newvid00001", channelId: A, publishedAt: hoursAgo(2), views: 40, title: "New" },
    ],
  });
  vi.stubGlobal("fetch", fake.fetch);
  channelId = store.insertChannel({
    youtubeChannelId: A,
    title: "A",
    handle: "@a",
    avatarUrl: null,
    subscriberCount: 1000,
    videoCount: 1,
  }).channel.id;
  store.setPlaylistId(channelId, `UULF${A.slice(2)}`);
  store.upsertVideos(channelId, [known], hoursAgo(5));
});

afterEach(async () => {
  await waitForChannelJobs();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("pollFollowedSnapshots", () => {
  it("imports a new RSS id and refreshes a young video whose snapshot is stale", async () => {
    const outcome = await pollFollowedSnapshots(() => NOW);
    expect(outcome).toEqual({ rssNew: 1, refreshed: 1, status: "done" });
    expect(store.getVideo("newvid00001")).toMatchObject({ view_count: 40, title: "New" });
    expect(store.getVideo("oldvid00001")?.view_count).toBe(220);
    expect(latestSnapshotPairs(["oldvid00001"]).get("oldvid00001")?.latest.viewCount).toBe(220);
    expect(fake.count("videos")).toBeGreaterThanOrEqual(1);
    expect(fake.calls.some((call) => call.resource === "playlistItems")).toBe(false);
  });

  it("skips a channel that is mid-sync and stops on quota", async () => {
    acquireChannelLock(channelId);
    expect(await pollFollowedSnapshots(() => NOW)).toEqual({ rssNew: 0, refreshed: 0, status: "done" });
    expect(store.getVideo("newvid00001")).toBeNull();
    releaseChannelLock(channelId);

    fake.setQuotaAfter(0);
    const quota = await pollFollowedSnapshots(() => NOW);
    expect(quota.status).toBe("quota");
  });

  it("does nothing without a YouTube key", async () => {
    getDb().exec("DELETE FROM settings");
    vi.stubEnv("YOUTUBE_API_KEY", "");
    expect(await pollFollowedSnapshots(() => NOW)).toEqual({ rssNew: 0, refreshed: 0, status: "no-key" });
    expect(fake.count("videos")).toBe(0);
  });
});

describe("queueSnapshotPoll", () => {
  it("is throttled for 15 minutes unless forced", async () => {
    expect(queueSnapshotPoll({ now: NOW })).toEqual({ started: true, throttled: false });
    expect(queueSnapshotPoll({ now: new Date(NOW.getTime() + 60_000) })).toEqual({ started: false, throttled: true });
    expect(queueSnapshotPoll({ now: new Date(NOW.getTime() + 60_000), force: true })).toEqual({ started: true, throttled: false });
    await waitForChannelJobs();
    expect(store.getVideo("newvid00001")?.view_count).toBe(40);
  });

  it("does not start while the quota is blocked", () => {
    markQuotaBlocked(NOW);
    expect(queueSnapshotPoll({ now: NOW })).toEqual({ started: false, throttled: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run tests/channels/snapshot-poll.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Write minimal implementation**

`src/lib/youtube/snapshot-poll.ts`:

```ts
import { getTypedSettings } from "@/lib/settings";
import { fetchVideos, VIDEOS_BATCH_SIZE, YouTubeApiError } from "./api";
import * as store from "./channel-store";
import { fetchYoutubeRss } from "./rss";
import { markQuotaBlocked } from "./runtime";
import { pruneStatSnapshots, youngVideoIdsDueForSnapshot } from "./stat-snapshots";
import { keepVideo } from "./sync";
import { isChannelLocked } from "./runtime";

export async function pollFollowedSnapshots(now: () => Date = () => new Date()): Promise<{
  rssNew: number;
  refreshed: number;
  status: "done" | "no-key" | "quota" | "error";
}> {
  const apiKey = getTypedSettings().youtubeApiKey;
  if (!apiKey) return { rssNew: 0, refreshed: 0, status: "no-key" };

  let rssNew = 0;
  let refreshed = 0;
  const stamp = now().toISOString();

  try {
    for (const channel of store.listFollowedForPoll()) {
      if (isChannelLocked(channel.id)) continue;
      const filterByDuration = !channel.playlistId || !channel.playlistId.startsWith("UULF");
      const rssIds = await fetchYoutubeRss(channel.youtubeChannelId);
      const known = store.knownVideoIds(channel.id);
      const fresh = rssIds.filter((videoId) => !known.has(videoId));
      for (let start = 0; start < fresh.length; start += VIDEOS_BATCH_SIZE) {
        const { videos } = await fetchVideos(apiKey, fresh.slice(start, start + VIDEOS_BATCH_SIZE));
        const kept = videos.filter((video) => keepVideo(video, filterByDuration));
        if (kept.length === 0) continue;
        store.upsertVideos(channel.id, kept, stamp);
        rssNew += kept.length;
      }
      const due = youngVideoIdsDueForSnapshot(now(), channel.id);
      for (let start = 0; start < due.length; start += VIDEOS_BATCH_SIZE) {
        const batch = due.slice(start, start + VIDEOS_BATCH_SIZE);
        const { videos } = await fetchVideos(apiKey, batch);
        store.updateVideoStats(videos, stamp);
        refreshed += videos.length;
      }
    }
    pruneStatSnapshots(now());
    return { rssNew, refreshed, status: "done" };
  } catch (err) {
    if (err instanceof YouTubeApiError && err.isQuota) {
      markQuotaBlocked(now());
      return { rssNew, refreshed, status: "quota" };
    }
    return { rssNew, refreshed, status: "error" };
  }
}
```

`src/lib/youtube/runtime.ts` — add to `ChannelRuntime` and `createRuntime()`:

```ts
  snapshotPoll: Promise<void> | null;
  lastSnapshotPollAt: number;
```

Defaults: `snapshotPoll: null`, `lastSnapshotPollAt: 0`.

`src/lib/youtube/jobs.ts`:

```ts
export const RSS_POLL_THROTTLE_MS = 15 * 60 * 1000;

export function queueSnapshotPoll(options: { now?: Date; force?: boolean } = {}): { started: boolean; throttled: boolean } {
  const runtime = channelRuntime();
  const now = options.now ?? new Date();
  if (!getTypedSettings().youtubeApiKey) return { started: false, throttled: false };
  if (!options.force) {
    if (now.getTime() - runtime.lastSnapshotPollAt < RSS_POLL_THROTTLE_MS || isQuotaBlocked(now)) {
      return { started: false, throttled: true };
    }
  } else if (isQuotaBlocked(now)) {
    return { started: false, throttled: true };
  }
  runtime.lastSnapshotPollAt = now.getTime();
  if (runtime.snapshotPoll) return { started: true, throttled: false };
  runtime.snapshotPoll = pollFollowedSnapshots(() => now)
    .catch((err) => logFailure("snapshot poll failed", err))
    .finally(() => {
      runtime.snapshotPoll = null;
    });
  return { started: true, throttled: false };
}
```

Import `pollFollowedSnapshots` from `./snapshot-poll`.

`waitForChannelJobs`: if `runtime.snapshotPoll` is set, push it onto `pending`.

`src/app/api/channels/sync-stale/route.ts` — after `queueChannelSyncs({ all })`, call `queueSnapshotPoll()` (do not change the JSON body; keep `{ queued, throttled }` so `channels-routes` stays green).

`force: true` still respects the quota block (second `queueSnapshotPoll` test). A second `force` while the first promise is in-flight returns `{ started: true, throttled: false }` without spawning a second poll — the first poll will see the new RSS video once `upsertVideos` from the first run finishes. The throttle test awaits `waitForChannelJobs` afterwards.

When `queueSnapshotPoll({ now: NOW })` runs the first time, `pollFollowedSnapshots` is invoked with `() => now` (the frozen `NOW`). That matches the poller tests’ stamps.

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run tests/channels/snapshot-poll.test.ts tests/channels/jobs.test.ts tests/channels/channels-routes.test.ts tests/channels/sync.test.ts`
Expected: PASS. `queueChannelSyncs` must **not** call `queueSnapshotPoll`. `sync-stale` may start a poll; `waitForChannelJobs` in that file already runs after the first POST. Fake RSS now answers on `www.youtube.com`, so the extra poll is 0-quota + maybe a `videos.list` on young rows if the stale sync has not locked the channel. That is acceptable (fake, no live quota).

- [ ] **Step 5: Commit**

```bash
git add src/lib/youtube/snapshot-poll.ts src/lib/youtube/runtime.ts src/lib/youtube/jobs.ts src/app/api/channels/sync-stale/route.ts tests/channels/snapshot-poll.test.ts
git commit -m "feat: poll followed RSS and young-video snapshots"
```

Skip when executing.

---

### Task 8 (optional — DO NOT IMPLEMENT this session): WebSub

**Files (later):**
- Create: `src/app/api/youtube/websub/route.ts`
- Create: `src/lib/youtube/websub.ts`
- Test: `tests/channels/websub.test.ts`

**Why skipped:** Compose publishes `127.0.0.1:3000` only. YouTube’s hub (`https://pubsubhubbub.appspot.com`) requires a public HTTPS callback. No env today carries a public origin.

**When to do it:** a later task, only if `THUMBGEN_PUBLIC_URL` (https) exists. Subscribe each followed `UC…` topic `https://www.youtube.com/xml/feeds/data/videos.xml?channel_id=UC…`. `GET` handshake echoes `hub.challenge`. `POST` Atom body → `parseYoutubeRss` → same `fetchVideos` + `upsertVideos` path as Task 7. Keep the 15-minute RSS poll as fallback. Do not replace snapshots or Tendance ranking.

Do **not** write these files now.

---

### Task 9: Regression sweep + Docker UI check

**Files:** none new. Touched tests only if a rename leaked (`scoreRisingHits`, `isRisingHit`, `TREND_VELOCITY_MIN`).

- [ ] **Step 1: Grep leftovers**

```bash
rg -n "scoreRisingHits|isRisingHit|TREND_VELOCITY_MIN|TREND_OVERPERF_MIN|grimpe assez fort|passed a numeric rising-hit" src tests
```

Expected: no production hits except comments/docs you intended. Fix any leftover import.

- [ ] **Step 2: Run the followed-channel + UI tests**

```bash
./node_modules/.bin/vitest run tests/channels tests/library/followed-themes-ui.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Rebuild Docker from the main repo**

```bash
cd /Users/antoinevigneau/thumbgen-real && docker compose up -d --build
```

Open http://localhost:3000 → Bibliothèque → Inspirations → Chaînes suivies.

Verify without clicking « Actualiser » / « Tout actualiser » / « Chercher »:
- Hero heading is `🏆 Tendance Youtube` (no extra subtitle under the title).
- If 7-day videos exist: up to 4 tiles, `why` contains either `moy. depuis publication` or `ça grimpe`, never `accélère`.
- If none: `Aucune vidéo publiée ces 7 derniers jours sur tes chaînes suivies.`
- Hover title on a tile matches the climb hint.
- Grid / period switch still works.

- [ ] **Step 4: Commit**

No source commit unless Step 1 required a fix. Skip git when executing.

---

## Self-review

**1. Spec coverage**

| Requirement | Task |
|---|---|
| `video_stat_snapshots` + prune > 30 days | 1, 2 |
| Write on existing sync (`upsert` / `updateVideoStats`) | 2 |
| RSS new ids (0 quota) + `videos.list` on videos < 7 d every 4 h | 6, 7 |
| App-open kick without folding into `queueChannelSyncs` | 7 |
| Velocity from Δ when ≥2 snapshots, else labeled average | 3, 4, 5 |
| Never lie « accélère » / « ça grimpe » on one relevé | 3, 5 |
| Tendance = all followed 7-day videos, top 4, no topic cluster, no velocity gate | 3, 4, 5 |
| Dead (`viewCount === 0`) excluded so it cannot sit at #1 | 3 |
| TypeSafe Choice (format) + Score (note); CODE owns ×N / rank / band words | 3b, 4, 5 |
| RSS default; WebSub later | 7, 8 skipped |
| No Invidious / Piped / yt-dlp / Social Blade / paid agent calls | Global + tests use fake |
| No `data/thumbgen.db` edits | Global |

**2. Placeholder scan**

No TBD / “implement later” / “write tests for the above”. Task 8 is a complete optional later slice and is explicitly not executed.

**3. Type consistency**

- `StatSnapshotPoint` / `SnapshotPair` defined in Task 2, used in Task 3 `WorkingSubjectVideo.snapshots`.
- `VelocityKind = "delta" | "average"` in Task 3, copied onto `VideoListItem.velocityKind` in Task 4, `climbHint` in Task 5.
- `scoreTrendVideos` / `pickTrendVideos` / `workingSubjectWhy({ velocityKind })` names match across Tasks 3–4.
- `listFollowedForPoll` (Task 2) consumed by Task 7.
- `queueSnapshotPoll` return `{ started, throttled }` is distinct from `queueChannelSyncs` `{ queued, throttled }` so the stale-sync JSON contract does not change.
- `pollFollowedSnapshots` return `{ rssNew, refreshed, status }` matches the Task 7 tests.
- `keepVideo(video, filterByDuration)` already exported from `sync.ts`.

**4. Ranking correction (2026-09-19)**

Old code (`overperf > 1` ∧ `velocity ≥ 1.5`, one-per-channel fill) is deleted. Tests now expect `hot-a, hot-b, slow, under` (top 4 including below-median) and `o-hot, m-recent, o-new` in `workingSubject`. Why-line default is `moy. depuis publication` until two snapshots exist.

---

## Execution notes (this session)

User already chose inline execution. Skip every `git commit`. Skip Task 8. Work on the current branch in `/Users/antoinevigneau/thumbgen-real`. After Task 9, report: plan path, what deepened, what shipped, tests, rebuild.

## Execution status (2026-09-19)

- Tasks 1–4, 3b, 6–7: implemented (commits skipped).
- Task 5: honest climb copy + visible CODE band words (`Surperforme` / `Dans la moyenne` / `Sous-performe`) + format + note.
- Task 8: skipped (no public HTTPS).
- Task 9: Vitest + `docker compose up -d --build` from the main repo. No live TypeSafe / YouTube hammering. No `data/thumbgen.db` edits.
