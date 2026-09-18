import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { getDb } from "@/lib/db";
import { migrateChannelTables } from "@/lib/youtube/migrations";

const columns = (database: Database.Database, table: string) =>
  (database.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((column) => column.name);

describe("channel tables", () => {
  it("exist in the app database with every column and index", () => {
    const db = getDb();
    expect(columns(db, "followed_channels")).toEqual(
      expect.arrayContaining([
        "id",
        "youtube_channel_id",
        "title",
        "handle",
        "avatar_url",
        "subscriber_count",
        "is_mine",
        "median_views",
        "last_synced_at",
        "sync_status",
        "sync_error",
        "playlist_id",
        "backfill_page_token",
        "backfill_done",
        "sync_page_token",
        "created_at",
      ]),
    );
    expect(columns(db, "channel_videos")).toEqual(
      expect.arrayContaining([
        "video_id",
        "channel_id",
        "title",
        "published_at",
        "duration_seconds",
        "view_count",
        "like_count",
        "thumbnail_url",
        "description",
        "stats_updated_at",
        "thumb_type",
        "thumb_type_source",
        "classify_attempts",
        "classify_approved",
        "swipe_file_id",
        "created_at",
      ]),
    );
    expect(columns(db, "youtube_oauth")).toEqual(expect.arrayContaining(["refresh_token", "ingest_status"]));
    expect(columns(db, "video_transcripts")).toEqual(expect.arrayContaining(["video_id", "source", "text"]));
    expect(columns(db, "channel_knowledge")).toEqual(expect.arrayContaining(["document_md", "json"]));
    const indexes = (db.prepare("PRAGMA index_list(channel_videos)").all() as { name: string }[]).map((index) => index.name);
    expect(indexes).toEqual(
      expect.arrayContaining(["idx_channel_videos_channel_id", "idx_channel_videos_published_at", "idx_channel_videos_thumb_type"]),
    );
  });

  it("adds the resume and classification columns to tables created without them", () => {
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE followed_channels (
        id TEXT PRIMARY KEY, youtube_channel_id TEXT NOT NULL UNIQUE, title TEXT NOT NULL, handle TEXT,
        avatar_url TEXT, subscriber_count INTEGER, is_mine INTEGER NOT NULL DEFAULT 0, median_views REAL,
        last_synced_at TEXT, sync_status TEXT NOT NULL DEFAULT 'idle', sync_error TEXT, created_at TEXT NOT NULL DEFAULT ''
      );
      CREATE TABLE channel_videos (
        video_id TEXT PRIMARY KEY, channel_id TEXT NOT NULL, title TEXT NOT NULL, published_at TEXT NOT NULL,
        duration_seconds INTEGER NOT NULL DEFAULT 0, view_count INTEGER NOT NULL DEFAULT 0, like_count INTEGER,
        thumbnail_url TEXT NOT NULL, stats_updated_at TEXT NOT NULL, thumb_type TEXT, thumb_type_source TEXT,
        created_at TEXT NOT NULL DEFAULT ''
      );
    `);
    migrateChannelTables(db);
    expect(columns(db, "followed_channels")).toEqual(expect.arrayContaining(["playlist_id", "backfill_page_token", "backfill_done", "sync_page_token", "about"]));
    expect(columns(db, "channel_videos")).toEqual(expect.arrayContaining(["classify_attempts", "classify_approved", "swipe_file_id"]));
    db.close();
  });

  it("can run twice", () => {
    const db = new Database(":memory:");
    migrateChannelTables(db);
    migrateChannelTables(db);
    expect(columns(db, "channel_videos")).toContain("swipe_file_id");
    db.close();
  });

  it("deletes a channel's videos with the channel", () => {
    const db = getDb();
    db.prepare("DELETE FROM followed_channels WHERE id = 'cascade-channel'").run();
    db.prepare(
      "INSERT INTO followed_channels (id, youtube_channel_id, title) VALUES ('cascade-channel', 'UCcascadecascadecascade01', 'Cascade')",
    ).run();
    db.prepare(
      `INSERT INTO channel_videos (video_id, channel_id, title, published_at, thumbnail_url, stats_updated_at)
       VALUES ('cascadevid1', 'cascade-channel', 'V', '2026-01-01T00:00:00.000Z', 'https://i.ytimg.com/vi/cascadevid1/mqdefault.jpg', '2026-01-01T00:00:00.000Z')`,
    ).run();
    db.prepare("DELETE FROM followed_channels WHERE id = 'cascade-channel'").run();
    expect(db.prepare("SELECT COUNT(*) AS n FROM channel_videos WHERE video_id = 'cascadevid1'").get()).toEqual({ n: 0 });
  });
});
