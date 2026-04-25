import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

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
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

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

    CREATE TABLE IF NOT EXISTS conversations (
      id          TEXT PRIMARY KEY,
      project_id  TEXT NOT NULL,
      title       TEXT NOT NULL DEFAULT 'Nouvelle conversation',
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at  TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_conv_project ON conversations(project_id, deleted_at);

    CREATE TABLE IF NOT EXISTS messages (
      id              TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role            TEXT NOT NULL,
      content_json    TEXT NOT NULL,
      interrupted     INTEGER NOT NULL DEFAULT 0,
      total_input_tokens   INTEGER NOT NULL DEFAULT 0,
      total_output_tokens  INTEGER NOT NULL DEFAULT 0,
      cost_estimate   REAL NOT NULL DEFAULT 0,
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (conversation_id) REFERENCES conversations(id)
    );
    CREATE INDEX IF NOT EXISTS idx_msg_conv ON messages(conversation_id, created_at);

    CREATE TABLE IF NOT EXISTS chat_uploads (
      id          TEXT PRIMARY KEY,
      mime_type   TEXT NOT NULL,
      size        INTEGER NOT NULL,
      data        BLOB NOT NULL,
      attached    INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_chat_uploads_attached ON chat_uploads(attached, created_at);

    CREATE TABLE IF NOT EXISTS generated_sketches (
      id          TEXT PRIMARY KEY,
      prompt      TEXT NOT NULL,
      mime_type   TEXT NOT NULL,
      data        BLOB NOT NULL,
      attached    INTEGER NOT NULL DEFAULT 0,
      cost_estimate REAL NOT NULL DEFAULT 0,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_sketches_attached ON generated_sketches(attached, created_at);
  `);
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
