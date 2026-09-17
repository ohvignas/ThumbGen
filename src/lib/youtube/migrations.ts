import type Database from "better-sqlite3";

/**
 * Followed channels and their long-form videos (chantier D §2). Imported by
 * src/lib/db.ts at boot. Timestamps are ISO 8601 strings written by the app.
 */
export const CHANNEL_TABLES_DDL = `
  CREATE TABLE IF NOT EXISTS followed_channels (
    id                  TEXT PRIMARY KEY,
    youtube_channel_id  TEXT NOT NULL UNIQUE,
    title               TEXT NOT NULL,
    handle              TEXT,
    avatar_url          TEXT,
    subscriber_count    INTEGER,
    is_mine             INTEGER NOT NULL DEFAULT 0,
    median_views        REAL,
    last_synced_at      TEXT,
    sync_status         TEXT NOT NULL DEFAULT 'idle',
    sync_error          TEXT,
    playlist_id         TEXT,
    backfill_page_token TEXT,
    backfill_done       INTEGER NOT NULL DEFAULT 0,
    sync_page_token     TEXT,
    created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  CREATE TABLE IF NOT EXISTS channel_videos (
    video_id          TEXT PRIMARY KEY,
    channel_id        TEXT NOT NULL REFERENCES followed_channels(id) ON DELETE CASCADE,
    title             TEXT NOT NULL,
    published_at      TEXT NOT NULL,
    duration_seconds  INTEGER NOT NULL DEFAULT 0,
    view_count        INTEGER NOT NULL DEFAULT 0,
    like_count        INTEGER,
    thumbnail_url     TEXT NOT NULL,
    stats_updated_at  TEXT NOT NULL,
    thumb_type        TEXT,
    thumb_type_source TEXT,
    classify_attempts INTEGER NOT NULL DEFAULT 0,
    classify_approved INTEGER NOT NULL DEFAULT 0,
    swipe_file_id     TEXT,
    created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  CREATE INDEX IF NOT EXISTS idx_channel_videos_channel_id   ON channel_videos(channel_id);
  CREATE INDEX IF NOT EXISTS idx_channel_videos_published_at ON channel_videos(published_at);
  CREATE INDEX IF NOT EXISTS idx_channel_videos_thumb_type   ON channel_videos(thumb_type);
`;

// Columns the plan added on top of the spec's list (sync resume, classification
// queue, library copy). CREATE TABLE IF NOT EXISTS never alters an existing
// table, so a table created before one of them existed gets it here.
const ADDED_COLUMNS: ReadonlyArray<{ table: string; column: string; definition: string }> = [
  { table: "followed_channels", column: "playlist_id", definition: "TEXT" },
  { table: "followed_channels", column: "backfill_page_token", definition: "TEXT" },
  { table: "followed_channels", column: "backfill_done", definition: "INTEGER NOT NULL DEFAULT 0" },
  { table: "followed_channels", column: "sync_page_token", definition: "TEXT" },
  { table: "channel_videos", column: "classify_attempts", definition: "INTEGER NOT NULL DEFAULT 0" },
  { table: "channel_videos", column: "classify_approved", definition: "INTEGER NOT NULL DEFAULT 0" },
  { table: "channel_videos", column: "swipe_file_id", definition: "TEXT" },
];

export function migrateChannelTables(database: Database.Database): void {
  database.exec(CHANNEL_TABLES_DDL);
  for (const { table, column, definition } of ADDED_COLUMNS) {
    const existing = database.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (!existing.some((entry) => entry.name === column)) {
      database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  }
}
