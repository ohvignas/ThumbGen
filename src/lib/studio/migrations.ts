import type Database from "better-sqlite3";

export const STUDIO_TABLES_DDL = `
  CREATE TABLE IF NOT EXISTS studio_videos (
    video_id          TEXT PRIMARY KEY,
    title             TEXT NOT NULL DEFAULT '',
    youtube_url       TEXT,
    youtube_video_id  TEXT,
    etiquette         TEXT,
    summary           TEXT NOT NULL DEFAULT '',
    created_at        TEXT NOT NULL,
    updated_at        TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS studio_drafts (
    video_id        TEXT PRIMARY KEY REFERENCES studio_videos(video_id) ON DELETE CASCADE,
    script          TEXT NOT NULL DEFAULT '',
    description     TEXT NOT NULL DEFAULT '',
    title_variants  TEXT NOT NULL,
    updated_at      TEXT NOT NULL
  );
`;

const STUDIO_FTS_DDL = `
  CREATE VIRTUAL TABLE IF NOT EXISTS studio_corpus_fts USING fts5(
    video_id UNINDEXED,
    title,
    script,
    description,
    transcript
  );
`;

export function migrateStudioTables(database: Database.Database): void {
  database.exec(STUDIO_TABLES_DDL);
  const videoColumns = database.prepare("PRAGMA table_info(studio_videos)").all() as { name: string }[];
  if (!videoColumns.some((column) => column.name === "summary")) {
    database.exec("ALTER TABLE studio_videos ADD COLUMN summary TEXT NOT NULL DEFAULT ''");
  }
  try {
    database.exec(STUDIO_FTS_DDL);
  } catch (err) {
    console.warn("[studio] FTS5 indisponible, retrieve_own_corpus utilisera LIKE :", err);
  }
}
