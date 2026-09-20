import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { AGENT_TABLES_DDL } from "./agent/migrations";
import { migrateChannelTables } from "./youtube/migrations";

const DB_FILE = process.env.THUMBGEN_DB_PATH || path.join(process.cwd(), "data", "thumbgen.db");
const DATA_DIR = path.dirname(DB_FILE);

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

declare global {
  // eslint-disable-next-line no-var
  var __thumbgen_db: Database.Database | undefined;
}

function init(database: Database.Database) {
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");
  database.exec(`
    CREATE TABLE IF NOT EXISTS projects_meta (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS projects (
      id          TEXT PRIMARY KEY,
      nodes       TEXT NOT NULL DEFAULT '[]',
      edges       TEXT NOT NULL DEFAULT '[]',
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS generated_images (
      id          TEXT PRIMARY KEY,
      mime_type   TEXT NOT NULL,
      data        BLOB NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS swipe_files (
      id          TEXT PRIMARY KEY,
      title       TEXT NOT NULL DEFAULT 'Reference',
      mime_type   TEXT NOT NULL,
      size        INTEGER NOT NULL,
      data        BLOB NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS logos (
      id          TEXT PRIMARY KEY,
      label       TEXT NOT NULL DEFAULT 'Logo',
      mime_type   TEXT NOT NULL,
      size        INTEGER NOT NULL,
      data        BLOB NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS face_reactions (
      id          TEXT PRIMARY KEY,
      label       TEXT NOT NULL DEFAULT 'Face',
      mime_type   TEXT NOT NULL,
      size        INTEGER NOT NULL,
      data        BLOB NOT NULL,
      tags        TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS personas (
      id          TEXT PRIMARY KEY,
      label       TEXT NOT NULL DEFAULT 'Personnage',
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS persona_photos (
      id          TEXT PRIMARY KEY,
      persona_id  TEXT NOT NULL REFERENCES personas(id) ON DELETE CASCADE,
      angle       TEXT NOT NULL CHECK (angle IN ('front','left','right')),
      mime_type   TEXT NOT NULL,
      size        INTEGER NOT NULL,
      data        BLOB NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(persona_id, angle)
    );

    CREATE INDEX IF NOT EXISTS idx_persona_photos_persona_id ON persona_photos(persona_id);

    CREATE TABLE IF NOT EXISTS generations_log (
      id                  TEXT PRIMARY KEY,
      created_at          TEXT NOT NULL DEFAULT (datetime('now')),
      provider            TEXT NOT NULL,
      model               TEXT NOT NULL,
      endpoint            TEXT NOT NULL,
      cost_estimate       REAL NOT NULL DEFAULT 0,
      time_ms             INTEGER NOT NULL DEFAULT 0,
      input_tokens        INTEGER NOT NULL DEFAULT 0,
      output_tokens       INTEGER NOT NULL DEFAULT 0,
      total_tokens        INTEGER NOT NULL DEFAULT 0,
      image_count         INTEGER NOT NULL DEFAULT 0,
      prompt              TEXT,
      project_id          TEXT,
      status              TEXT NOT NULL DEFAULT 'success',
      error_message       TEXT,
      generated_image_ids TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_generations_log_created_at ON generations_log(created_at);
    CREATE INDEX IF NOT EXISTS idx_generations_log_model      ON generations_log(model);
    CREATE INDEX IF NOT EXISTS idx_generations_log_provider   ON generations_log(provider);

    CREATE TABLE IF NOT EXISTS canvas_tombstones (
      project_id TEXT NOT NULL,
      kind       TEXT NOT NULL CHECK (kind IN ('node', 'edge')),
      item_id    TEXT NOT NULL,
      deleted_at TEXT NOT NULL,
      PRIMARY KEY (project_id, kind, item_id)
    );
  `);
  database.exec(AGENT_TABLES_DDL);
  migrateChannelTables(database);

  // `CREATE TABLE IF NOT EXISTS` never alters a table that already exists —
  // a face_reactions table created before the `tags` column was added above
  // stays without it forever, and every query touching that column then
  // fails with "no such column: tags". Defensive one-off column add.
  const faceReactionsColumns = database.prepare("PRAGMA table_info(face_reactions)").all() as { name: string }[];
  if (!faceReactionsColumns.some((c) => c.name === "tags")) {
    database.exec("ALTER TABLE face_reactions ADD COLUMN tags TEXT");
  }

  // Generated images predate the miniatures gallery and were stored with no
  // link back to the project they belong to. Add the column, then backfill it
  // once from the canvases themselves: a generator node keeps its results as
  // /api/generated-images/image?id=<uuid> URLs, so the canvas is the only
  // existing record of which project produced which image.
  const generatedImageColumns = database.prepare("PRAGMA table_info(generated_images)").all() as { name: string }[];
  if (!generatedImageColumns.some((c) => c.name === "project_id")) {
    database.exec("ALTER TABLE generated_images ADD COLUMN project_id TEXT");
    database.exec("CREATE INDEX IF NOT EXISTS idx_generated_images_project ON generated_images(project_id)");
    backfillGeneratedImageProjects(database);
  }

  const projectMetaColumns = database.prepare("PRAGMA table_info(projects_meta)").all() as { name: string }[];
  if (!projectMetaColumns.some((c) => c.name === "description")) {
    database.exec("ALTER TABLE projects_meta ADD COLUMN description TEXT NOT NULL DEFAULT ''");
  }
  // Gallery card cover (« miniature gagnante »): one generated image per project.
  if (!projectMetaColumns.some((c) => c.name === "cover_image_id")) {
    database.exec("ALTER TABLE projects_meta ADD COLUMN cover_image_id TEXT");
  }

  pruneRemovedSettingsKeys(database);
}

const REMOVED_SETTINGS_KEYS = ["geminiApiKey", "ideogramApiKey", "grokApiKey", "anthropicApiKey", "sitePassword"];

/**
 * The Réglages rework (2026-09-16) dropped geminiApiKey/ideogramApiKey/
 * grokApiKey/anthropicApiKey/sitePassword from the settings schema — the
 * OpenRouter Unified Image API replaced the direct provider keys, and
 * sitePassword is now env-only. Rows written before that change linger in
 * an existing settings table (CREATE TABLE IF NOT EXISTS never removes a
 * column/row) and get copied into every backup, including any leftover
 * secret values. The DELETE is naturally idempotent, so this can run on
 * every startup with no separate "already ran" guard needed — exported so
 * tests can exercise it directly without needing to reopen the database.
 */
export function pruneRemovedSettingsKeys(database: Database.Database): void {
  const placeholders = REMOVED_SETTINGS_KEYS.map(() => "?").join(",");
  database.prepare(`DELETE FROM settings WHERE key IN (${placeholders})`).run(...REMOVED_SETTINGS_KEYS);
}

function backfillGeneratedImageProjects(database: Database.Database) {
  const projects = database.prepare("SELECT id, nodes FROM projects").all() as Array<{ id: string; nodes: string }>;
  const link = database.prepare("UPDATE generated_images SET project_id = ? WHERE id = ? AND project_id IS NULL");
  const run = database.transaction(() => {
    for (const project of projects) {
      const ids = new Set<string>();
      for (const match of project.nodes.matchAll(/generated-images\/image\?id=([0-9a-f-]{36})/g)) {
        ids.add(match[1]);
      }
      for (const imageId of ids) link.run(project.id, imageId);
    }
  });
  run();
}

function open(): Database.Database {
  const database = new Database(DB_FILE);
  init(database);
  return database;
}

export function getDb(): Database.Database {
  if (!global.__thumbgen_db) {
    global.__thumbgen_db = open();
  }
  return global.__thumbgen_db;
}

/** Absolute path of the SQLite file (THUMBGEN_DB_PATH or data/thumbgen.db). */
export function getDbFilePath(): string {
  return DB_FILE;
}

export type ImageMime = "image/png" | "image/jpeg" | "image/webp" | "image/gif" | "image/svg+xml";

export function extToMime(ext: string): string {
  const map: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
    svg: "image/svg+xml",
  };
  return map[ext.toLowerCase()] || "application/octet-stream";
}

export function parseDataUrl(dataUrl: string): { buffer: Buffer; mimeType: string } {
  const match = dataUrl.match(/^data:(.+?);base64,(.+)$/);
  if (!match) throw new Error("Invalid data URL");
  return {
    mimeType: match[1],
    buffer: Buffer.from(match[2], "base64"),
  };
}
