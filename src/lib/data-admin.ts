import fs from "fs";
import path from "path";
import { getDb, getDbFilePath } from "@/lib/db";

export type StorageStats = {
  dbBytes: number;
  walBytes: number;
  counts: {
    projects: number;
    conversations: number;
    messages: number;
    generatedImages: number;
    personas: number;
    logos: number;
    swipeFiles: number;
    sketches: number;
    chatUploads: number;
  };
};

export type BackupEntry = { name: string; createdAt: string; size: number; legacy: boolean };

export type CleanupCandidates = { sketches: number; chatUploads: number };

export type CleanupResult = {
  deletedSketches: number;
  deletedChatUploads: number;
  bytesBefore: number;
  bytesAfter: number;
};

export class BackupInProgressError extends Error {
  constructor() {
    super("A backup is already running");
    this.name = "BackupInProgressError";
  }
}

function fileSize(filePath: string): number {
  try {
    return fs.statSync(filePath).size;
  } catch {
    return 0;
  }
}

function databaseBytes(): number {
  return fileSize(getDbFilePath()) + fileSize(`${getDbFilePath()}-wal`);
}

function count(sql: string): number {
  return (getDb().prepare(sql).get() as { n: number }).n;
}

export function getStorageStats(): StorageStats {
  // Counting first also opens the database, so the file exists before it is measured.
  const counts = {
    projects: count("SELECT COUNT(*) AS n FROM projects_meta"),
    conversations: count("SELECT COUNT(*) AS n FROM conversations WHERE deleted_at IS NULL"),
    messages: count("SELECT COUNT(*) AS n FROM messages"),
    generatedImages: count("SELECT COUNT(*) AS n FROM generated_images"),
    personas: count("SELECT COUNT(*) AS n FROM personas"),
    logos: count("SELECT COUNT(*) AS n FROM logos"),
    swipeFiles: count("SELECT COUNT(*) AS n FROM swipe_files"),
    sketches: count("SELECT COUNT(*) AS n FROM generated_sketches"),
    chatUploads: count("SELECT COUNT(*) AS n FROM chat_uploads"),
  };
  const dbFile = getDbFilePath();
  return { dbBytes: fileSize(dbFile), walBytes: fileSize(`${dbFile}-wal`), counts };
}

export function backupsDir(): string {
  return path.join(path.dirname(getDbFilePath()), "backups");
}

type LocatedBackup = BackupEntry & { filePath: string };

function locate(dir: string, name: string, legacy: boolean): LocatedBackup | null {
  const filePath = path.join(dir, name);
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return null;
    return { name, createdAt: stat.mtime.toISOString(), size: stat.size, legacy, filePath };
  } catch {
    return null;
  }
}

/**
 * Backups made by this page (data/backups/*.db) plus older manual copies
 * next to the live database (thumbgen.db.*, without their -wal/-shm files).
 */
function locateBackups(): LocatedBackup[] {
  const found: LocatedBackup[] = [];
  const dir = backupsDir();
  if (fs.existsSync(dir)) {
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith(".db")) continue;
      const entry = locate(dir, name, false);
      if (entry) found.push(entry);
    }
  }
  const dataDir = path.dirname(getDbFilePath());
  const legacyPrefix = `${path.basename(getDbFilePath())}.`;
  for (const name of fs.readdirSync(dataDir)) {
    if (!name.startsWith(legacyPrefix) || name.endsWith("-wal") || name.endsWith("-shm")) continue;
    const entry = locate(dataDir, name, true);
    if (entry) found.push(entry);
  }
  return found.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function listBackups(): BackupEntry[] {
  return locateBackups().map((backup) => ({
    name: backup.name,
    createdAt: backup.createdAt,
    size: backup.size,
    legacy: backup.legacy,
  }));
}

/** Whitelist: only an exact name from the list resolves; paths and ".." never do. */
export function resolveBackupPath(name: string): string | null {
  return locateBackups().find((backup) => backup.name === name)?.filePath ?? null;
}

// Plain module state is not guaranteed to be shared across separate route
// bundles (see the DB singleton's own `global.__thumbgen_db` above) — stash
// the in-progress flag on globalThis the same way so two routes agree on it.
declare global {
  // eslint-disable-next-line no-var
  var __thumbgen_backup_running: boolean | undefined;
}

function isBackupRunning(): boolean {
  return global.__thumbgen_backup_running ?? false;
}

function setBackupRunning(running: boolean): void {
  global.__thumbgen_backup_running = running;
}

function timestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

/** Online backup through better-sqlite3 (safe while the app keeps writing). */
export async function createBackup(now: Date = new Date()): Promise<BackupEntry> {
  if (isBackupRunning()) throw new BackupInProgressError();
  setBackupRunning(true);
  const dir = backupsDir();
  fs.mkdirSync(dir, { recursive: true });
  const base = `thumbgen-${timestamp(now)}`;
  let name = `${base}.db`;
  for (let suffix = 1; fs.existsSync(path.join(dir, name)); suffix++) name = `${base}-${suffix}.db`;
  const filePath = path.join(dir, name);
  try {
    await getDb().backup(filePath);
    const entry = locate(dir, name, false);
    if (!entry) throw new Error(`Backup file missing after backup: ${name}`);
    return { name: entry.name, createdAt: entry.createdAt, size: entry.size, legacy: entry.legacy };
  } catch (err) {
    // db.backup() can throw partway through (disk full, I/O error, etc.),
    // leaving a partial .db file behind that listBackups() would otherwise
    // list as a valid, restorable backup. Remove it before rethrowing.
    try {
      fs.unlinkSync(filePath);
    } catch {
      // Nothing was written yet, or it's already gone — fine either way.
    }
    throw err;
  } finally {
    setBackupRunning(false);
  }
}

export function deleteBackup(name: string): boolean {
  const filePath = resolveBackupPath(name);
  if (!filePath) return false;
  fs.unlinkSync(filePath);
  return true;
}

const STALE = "attached = 0 AND created_at < datetime('now', '-24 hours')";

export function countCleanupCandidates(): CleanupCandidates {
  return {
    sketches: count(`SELECT COUNT(*) AS n FROM generated_sketches WHERE ${STALE}`),
    chatUploads: count(`SELECT COUNT(*) AS n FROM chat_uploads WHERE ${STALE}`),
  };
}

export function runCleanup(): CleanupResult {
  if (isBackupRunning()) throw new BackupInProgressError();
  const db = getDb();
  const bytesBefore = databaseBytes();
  const deleted = db.transaction(() => ({
    sketches: db.prepare(`DELETE FROM generated_sketches WHERE ${STALE}`).run().changes,
    chatUploads: db.prepare(`DELETE FROM chat_uploads WHERE ${STALE}`).run().changes,
  }))();
  db.exec("VACUUM");
  // In WAL mode the main file only shrinks once the WAL is checkpointed.
  db.pragma("wal_checkpoint(TRUNCATE)");
  return {
    deletedSketches: deleted.sketches,
    deletedChatUploads: deleted.chatUploads,
    bytesBefore,
    bytesAfter: databaseBytes(),
  };
}
