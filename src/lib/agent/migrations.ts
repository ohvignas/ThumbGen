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

  -- Thumbnail brief (« fiche », chantier F3): one per conversation, the
  -- decisions of the thumbnail journey as JSON (src/lib/brief/schema.ts).
  -- updated_at is ISO. Deleted with its conversation or its project.
  CREATE TABLE IF NOT EXISTS thumbnail_briefs (
    conversation_id TEXT PRIMARY KEY,
    project_id      TEXT NOT NULL,
    data            TEXT NOT NULL,
    updated_at      TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_thumbnail_briefs_project ON thumbnail_briefs(project_id);

  -- One library copy per YouTube video (chantier F3b), including videos of
  -- channels that are not followed.
  CREATE TABLE IF NOT EXISTS youtube_thumbnail_copies (
    video_id      TEXT PRIMARY KEY,
    swipe_file_id TEXT NOT NULL
  );

  -- Vision analysis of a YouTube thumbnail, reused by the journey and chantier D.
  CREATE TABLE IF NOT EXISTS thumbnail_analyses (
    video_id     TEXT PRIMARY KEY,
    data         TEXT NOT NULL,
    analyzed_at  TEXT NOT NULL
  );

  -- Last competitor search of a conversation (not in the brief: no images for the model).
  CREATE TABLE IF NOT EXISTS competitor_search_results (
    conversation_id TEXT PRIMARY KEY,
    data            TEXT NOT NULL,
    searched_at     TEXT NOT NULL
  );

  -- 24 h cache of a channel's median views for competitor scoring.
  CREATE TABLE IF NOT EXISTS channel_median_cache (
    youtube_channel_id TEXT PRIMARY KEY,
    median_views       REAL,
    sample_count       INTEGER NOT NULL,
    fetched_at         TEXT NOT NULL
  );
`;
