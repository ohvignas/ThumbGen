// Single source of truth for agent-feature DDL.
// Imported by both src/lib/db.ts (auto-init at boot) and scripts/migrate-agent-tables.ts.
export const AGENT_TABLES_DDL = `
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

  -- Canvas state saved right before an agent write (apply_workflow) or a
  -- restore, so every agent change can be undone from « Historique de
  -- l'agent ». created_at is ISO; only the 20 most recent rows per project
  -- are kept (see src/lib/canvas-snapshots.ts).
  CREATE TABLE IF NOT EXISTS canvas_snapshots (
    id          TEXT PRIMARY KEY,
    project_id  TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    nodes       TEXT NOT NULL,
    edges       TEXT NOT NULL,
    reason      TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_canvas_snapshots_project ON canvas_snapshots(project_id, created_at);
`;
