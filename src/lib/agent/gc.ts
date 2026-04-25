import { getDb } from "@/lib/db";

export type GcResult = { uploads: number; sketches: number };

const UPLOAD_TTL_HOURS = 24;
const SKETCH_TTL_HOURS = 1;

/**
 * Deletes unattached chat uploads older than 24h and unattached generated
 * sketches older than 1h. Returns the count of deleted rows per kind.
 *
 * Idempotent and safe to call concurrently — better-sqlite3 serializes
 * statements within a process.
 */
export function runGc(): GcResult {
  const db = getDb();
  const uploads = db
    .prepare(
      `DELETE FROM chat_uploads WHERE attached = 0 AND created_at < datetime('now', '-${UPLOAD_TTL_HOURS} hours')`,
    )
    .run();
  const sketches = db
    .prepare(
      `DELETE FROM generated_sketches WHERE attached = 0 AND created_at < datetime('now', '-${SKETCH_TTL_HOURS} hours')`,
    )
    .run();
  return { uploads: uploads.changes, sketches: sketches.changes };
}

let interval: NodeJS.Timeout | null = null;

/**
 * Starts a background interval that runs the GC every hour.
 * Idempotent: calling again is a no-op.
 *
 * The first GC happens immediately on start so freshly-restarted servers
 * don't sit on stale rows for an hour.
 */
export function startGcLoop(): void {
  if (interval) return;
  // Initial sweep
  try {
    runGc();
  } catch {
    // best-effort, never crash startup
  }
  interval = setInterval(() => {
    try {
      runGc();
    } catch {
      // never crash the process from a GC error
    }
  }, 60 * 60 * 1000);
  // Allow Node to exit cleanly even with the interval pending (mostly for tests)
  if (typeof interval.unref === "function") interval.unref();
}

/** For testing only. */
export function _stopGcLoop(): void {
  if (interval) {
    clearInterval(interval);
    interval = null;
  }
}
