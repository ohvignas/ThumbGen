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
    description       TEXT,
    created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  CREATE INDEX IF NOT EXISTS idx_channel_videos_channel_id   ON channel_videos(channel_id);
  CREATE INDEX IF NOT EXISTS idx_channel_videos_published_at ON channel_videos(published_at);
  CREATE INDEX IF NOT EXISTS idx_channel_videos_thumb_type   ON channel_videos(thumb_type);

  CREATE TABLE IF NOT EXISTS video_stat_snapshots (
    video_id     TEXT NOT NULL REFERENCES channel_videos(video_id) ON DELETE CASCADE,
    captured_at  TEXT NOT NULL,
    view_count   INTEGER NOT NULL DEFAULT 0,
    like_count   INTEGER,
    PRIMARY KEY (video_id, captured_at)
  );

  CREATE INDEX IF NOT EXISTS idx_video_stat_snapshots_video    ON video_stat_snapshots(video_id, captured_at);
  CREATE INDEX IF NOT EXISTS idx_video_stat_snapshots_captured ON video_stat_snapshots(captured_at);

  CREATE TABLE IF NOT EXISTS youtube_oauth (
    id                       TEXT PRIMARY KEY,
    channel_youtube_id       TEXT,
    channel_title            TEXT,
    channel_handle           TEXT,
    refresh_token            TEXT NOT NULL,
    access_token             TEXT,
    access_token_expires_at  INTEGER,
    scopes                   TEXT NOT NULL,
    connected_at             TEXT NOT NULL,
    last_ingest_at           TEXT,
    ingest_status            TEXT NOT NULL DEFAULT 'idle',
    ingest_error             TEXT,
    ingest_step              TEXT,
    videos_total             INTEGER NOT NULL DEFAULT 0,
    videos_done              INTEGER NOT NULL DEFAULT 0,
    transcripts_done         INTEGER NOT NULL DEFAULT 0,
    transcripts_failed       INTEGER NOT NULL DEFAULT 0,
    analysis_done            INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS youtube_oauth_state (
    state           TEXT PRIMARY KEY,
    origin          TEXT NOT NULL,
    created_at      TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS channel_video_analytics (
    video_id                    TEXT PRIMARY KEY REFERENCES channel_videos(video_id) ON DELETE CASCADE,
    period_start                TEXT NOT NULL,
    period_end                  TEXT NOT NULL,
    views                       INTEGER,
    engaged_views               INTEGER,
    estimated_minutes_watched   REAL,
    average_view_duration       INTEGER,
    average_view_percentage     REAL,
    likes                       INTEGER,
    comments                    INTEGER,
    shares                      INTEGER,
    subscribers_gained          INTEGER,
    fetched_at                  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS channel_analytics_summary (
    channel_id                  TEXT NOT NULL REFERENCES followed_channels(id) ON DELETE CASCADE,
    period                      TEXT NOT NULL,
    period_start                TEXT NOT NULL,
    period_end                  TEXT NOT NULL,
    views                       INTEGER,
    estimated_minutes_watched   REAL,
    average_view_duration       INTEGER,
    average_view_percentage     REAL,
    subscribers_gained          INTEGER,
    subscribers_lost            INTEGER,
    fetched_at                  TEXT NOT NULL,
    PRIMARY KEY (channel_id, period)
  );

  CREATE TABLE IF NOT EXISTS video_transcripts (
    video_id       TEXT PRIMARY KEY REFERENCES channel_videos(video_id) ON DELETE CASCADE,
    source         TEXT NOT NULL,
    language       TEXT,
    text           TEXT NOT NULL,
    char_count     INTEGER NOT NULL,
    summary        TEXT,
    topics         TEXT,
    hook           TEXT,
    fetched_at     TEXT NOT NULL,
    summarized_at  TEXT
  );

  CREATE TABLE IF NOT EXISTS channel_knowledge (
    channel_id         TEXT PRIMARY KEY REFERENCES followed_channels(id) ON DELETE CASCADE,
    generated_at       TEXT NOT NULL,
    document_md        TEXT NOT NULL,
    json               TEXT NOT NULL,
    video_count        INTEGER NOT NULL,
    transcript_count   INTEGER NOT NULL
  );
`;

const KNOWLEDGE_FTS_DDL = `
  CREATE VIRTUAL TABLE IF NOT EXISTS video_knowledge_fts USING fts5(
    video_id UNINDEXED,
    title,
    summary,
    body
  );
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
  { table: "followed_channels", column: "about", definition: "TEXT" },
  { table: "channel_videos", column: "description", definition: "TEXT" },
];

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

export function migrateChannelTables(database: Database.Database): void {
  database.exec(CHANNEL_TABLES_DDL);
  try {
    database.exec(KNOWLEDGE_FTS_DDL);
  } catch (err) {
    console.warn("[channels] FTS5 indisponible, la recherche plein texte utilisera LIKE :", err);
  }
  for (const { table, column, definition } of ADDED_COLUMNS) {
    const existing = database.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (!existing.some((entry) => entry.name === column)) {
      database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  }
  backfillVideoStatSnapshots(database);
}
