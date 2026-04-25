import { getDb } from "../src/lib/db";

const db = getDb();
db.exec(`
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
console.log("Migration done.");
