/**
 * Dev-only helper for the « Chaînes suivies » UI checks.
 *
 * Fills a THROWAWAY ThumbGen database with followed channels and videos so
 * Bibliothèque → Inspirations can be exercised without calling YouTube or
 * OpenRouter. It stores FAKE keys so the UI shows its configured state, and
 * more than 200 unclassified thumbnails so the classifier waits for a
 * confirmation instead of sending anything.
 *
 *   /opt/homebrew/bin/node scripts/seed-followed-channels.mjs <throwaway-db-path>
 *
 * Refuses any path ending with data/thumbgen.db. Run it once the dev server has created the tables
 * (a single GET /api/channels is enough). Safe to run again.
 */
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const target = process.argv[2];
if (!target) {
  console.error("Usage: node scripts/seed-followed-channels.mjs <throwaway-db-path>");
  process.exit(1);
}
// Any checkout's real database (this worktree's, the main one's, a copy's) ends with data/thumbgen.db.
// realpath follows symlinks to an existing file; the check is case-insensitive for macOS volumes.
const resolvedTarget = fs.existsSync(target) ? fs.realpathSync(target) : path.resolve(target);
const looksReal = (candidate) => candidate.split(path.sep).join("/").toLowerCase().endsWith("/data/thumbgen.db");
if (looksReal(path.resolve(target)) || looksReal(resolvedTarget)) {
  console.error("Refusing to seed a real ThumbGen database (…/data/thumbgen.db).");
  process.exit(1);
}

const db = new Database(target);
db.pragma("foreign_keys = ON");
const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('followed_channels', 'channel_videos')")
  .all();
if (tables.length !== 2) {
  console.error("Channel tables missing: request /api/channels on the dev server once, then retry.");
  process.exit(1);
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const now = Date.now();
const ago = (ms) => new Date(now - ms).toISOString();
const QUOTA = "Quota YouTube atteint — reprise demain";
const REAL_VIDEO_IDS = ["jNQXAC9IVRw", "dQw4w9WgXcQ", "9bZkp7q19f0", "kJQP7kiw5Fk", "OPf0YbXqDm0"];
const TYPES = ["face_text", "reaction", "before_after", "versus", "screenshot", "object", "text_only", "scene"];
const FACTORS = [0.3, 0.8, 1, 1.2, 2, 4.5, 9];

const channels = [
  { id: "seed-mine", letter: "m", title: "Ma chaîne de test", handle: "@machainedetest", subscribers: 12_500, mine: 1, median: 10_000, syncedAgo: 2 * HOUR, status: "idle", error: null, videos: 150 },
  { id: "seed-other", letter: "o", title: "Chaîne tierce", handle: "@chainetierce", subscribers: 250_000, mine: 0, median: 40_000, syncedAgo: 30 * 60_000, status: "error", error: QUOTA, videos: 150 },
  { id: "seed-stale", letter: "s", title: "Chaîne à rafraîchir", handle: "@arafraichir", subscribers: 900, mine: 0, median: null, syncedAgo: 13 * HOUR, status: "idle", error: null, videos: 0 },
];

const upsertSetting = db.prepare(
  "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
);
const insertChannel = db.prepare(
  `INSERT INTO followed_channels
     (id, youtube_channel_id, title, handle, avatar_url, subscriber_count, is_mine, median_views,
      last_synced_at, sync_status, sync_error, playlist_id, backfill_done)
   VALUES (@id, @youtubeChannelId, @title, @handle, NULL, @subscribers, @mine, @median,
      @syncedAt, @status, @error, @playlistId, 1)`,
);
const insertVideo = db.prepare(
  `INSERT INTO channel_videos
     (video_id, channel_id, title, published_at, duration_seconds, view_count, like_count, thumbnail_url,
      stats_updated_at, thumb_type, thumb_type_source)
   VALUES (@videoId, @channelId, @title, @publishedAt, 600, @views, NULL, @thumbnailUrl,
      @statsUpdatedAt, @thumbType, @thumbTypeSource)`,
);

db.transaction(() => {
  upsertSetting.run("youtubeApiKey", "fake-key-for-ui-check");
  upsertSetting.run("openrouterApiKey", "fake-key-for-ui-check");
  upsertSetting.run("youtubePlaylistId", `UC${"m".repeat(22)}`);
  db.prepare(`DELETE FROM followed_channels WHERE id IN (${channels.map(() => "?").join(", ")})`).run(
    ...channels.map((channel) => channel.id),
  );
  for (const channel of channels) {
    const youtubeChannelId = `UC${channel.letter.repeat(22)}`;
    insertChannel.run({
      id: channel.id,
      youtubeChannelId,
      title: channel.title,
      handle: channel.handle,
      subscribers: channel.subscribers,
      mine: channel.mine,
      median: channel.median,
      syncedAt: ago(channel.syncedAgo),
      status: channel.status,
      error: channel.error,
      playlistId: `UULF${youtubeChannelId.slice(2)}`,
    });
    for (let index = 0; index < channel.videos; index += 1) {
      const videoId =
        channel.mine && index < REAL_VIDEO_IDS.length ? REAL_VIDEO_IDS[index] : `${channel.letter}${String(index).padStart(10, "0")}`;
      const classified = index < 30;
      insertVideo.run({
        videoId,
        channelId: channel.id,
        title: `Vidéo test ${index + 1} — ${channel.title}`,
        publishedAt: ago((index * 3 + 1) * DAY),
        views: Math.round(channel.median * FACTORS[index % FACTORS.length]),
        thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
        statsUpdatedAt: ago(channel.syncedAgo),
        thumbType: classified ? TYPES[index % TYPES.length] : null,
        thumbTypeSource: classified ? (index % 10 === 0 ? "manual" : "ai") : null,
      });
    }
  }
})();

const { pending } = db.prepare("SELECT COUNT(*) AS pending FROM channel_videos WHERE thumb_type IS NULL").get();
console.log(`Seeded ${channels.length} channels; ${pending} thumbnails wait for classification (over 200: nothing is sent).`);
db.close();
