import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { v4 as uuid } from "uuid";
import { getDb, getDbFilePath } from "@/lib/db";
import {
  BackupInProgressError,
  backupsDir,
  countCleanupCandidates,
  createBackup,
  deleteBackup,
  getStorageStats,
  listBackups,
  resolveBackupPath,
  runCleanup,
} from "@/lib/data-admin";

const dataDir = () => path.dirname(getDbFilePath());
const LEGACY_FILES = ["thumbgen.db.bak-test", "thumbgen.db.bak-test-wal", "thumbgen.db.bak-test-shm", "notes.txt"];

function insertUpload(ageHours: number, attached: 0 | 1): string {
  const id = `up_${uuid().replace(/-/g, "")}`;
  getDb()
    .prepare(
      "INSERT INTO chat_uploads (id, mime_type, size, data, attached, created_at) VALUES (?, ?, ?, ?, ?, datetime('now', ?))",
    )
    .run(id, "image/png", 1, Buffer.from([0]), attached, `-${ageHours} hours`);
  return id;
}

function insertSketch(ageHours: number, attached: 0 | 1): string {
  const id = `sk_${uuid().replace(/-/g, "")}`;
  getDb()
    .prepare(
      "INSERT INTO generated_sketches (id, prompt, mime_type, data, attached, created_at) VALUES (?, ?, ?, ?, ?, datetime('now', ?))",
    )
    .run(id, "test", "image/png", Buffer.from([0]), attached, `-${ageHours} hours`);
  return id;
}

function exists(table: "chat_uploads" | "generated_sketches", id: string): boolean {
  return Boolean(getDb().prepare(`SELECT 1 FROM ${table} WHERE id = ?`).get(id));
}

beforeEach(() => {
  getDb().exec("DELETE FROM chat_uploads; DELETE FROM generated_sketches;");
  fs.rmSync(backupsDir(), { recursive: true, force: true });
});

afterEach(() => {
  for (const name of LEGACY_FILES) fs.rmSync(path.join(dataDir(), name), { force: true });
});

describe("getStorageStats", () => {
  it("reports the database size and the row counts", () => {
    const before = getStorageStats();
    insertUpload(1, 0);
    const after = getStorageStats();
    expect(after.dbBytes).toBeGreaterThan(0);
    expect(after.walBytes).toBeGreaterThanOrEqual(0);
    expect(after.counts.chatUploads).toBe(before.counts.chatUploads + 1);
    expect(Object.keys(after.counts).sort()).toEqual(
      ["chatUploads", "conversations", "generatedImages", "logos", "messages", "personas", "projects", "sketches", "swipeFiles"].sort(),
    );
  });
});

describe("backups", () => {
  it("creates a valid SQLite copy in data/backups", async () => {
    const entry = await createBackup(new Date(2026, 8, 16, 10, 5, 7));
    expect(entry.name).toBe("thumbgen-20260916-100507.db");
    expect(entry.legacy).toBe(false);
    expect(entry.size).toBeGreaterThan(0);
    const file = path.join(backupsDir(), entry.name);
    const copy = new Database(file, { readonly: true });
    expect(copy.pragma("integrity_check", { simple: true })).toBe("ok");
    copy.close();
  });

  it("never overwrites a backup taken in the same second", async () => {
    const at = new Date(2026, 8, 16, 11, 0, 0);
    const first = await createBackup(at);
    const second = await createBackup(at);
    expect(first.name).toBe("thumbgen-20260916-110000.db");
    expect(second.name).toBe("thumbgen-20260916-110000-1.db");
  });

  it("refuses a second backup while one is running", async () => {
    const running = createBackup();
    await expect(createBackup()).rejects.toBeInstanceOf(BackupInProgressError);
    await running;
  });

  it("lists backups and legacy copies, but not WAL/SHM files or the live database", async () => {
    await createBackup(new Date(2026, 8, 16, 12, 0, 0));
    for (const name of LEGACY_FILES) fs.writeFileSync(path.join(dataDir(), name), "x");
    const names = listBackups().map((backup) => [backup.name, backup.legacy]);
    expect(names).toContainEqual(["thumbgen-20260916-120000.db", false]);
    expect(names).toContainEqual(["thumbgen.db.bak-test", true]);
    const flat = names.map(([name]) => name);
    expect(flat).not.toContain("thumbgen.db");
    expect(flat).not.toContain("thumbgen.db-wal");
    expect(flat).not.toContain("thumbgen.db.bak-test-wal");
    expect(flat).not.toContain("thumbgen.db.bak-test-shm");
    expect(flat).not.toContain("notes.txt");
  });

  it("resolves only names returned by the list", async () => {
    const entry = await createBackup(new Date(2026, 8, 16, 13, 0, 0));
    expect(resolveBackupPath(entry.name)).toBe(path.join(backupsDir(), entry.name));
    expect(resolveBackupPath("thumbgen.db")).toBeNull();
    expect(resolveBackupPath("../thumbgen.db")).toBeNull();
    expect(resolveBackupPath(`backups/${entry.name}`)).toBeNull();
    expect(resolveBackupPath("")).toBeNull();
  });

  it("deletes a listed backup and nothing else", async () => {
    const entry = await createBackup(new Date(2026, 8, 16, 14, 0, 0));
    expect(deleteBackup("../thumbgen.db")).toBe(false);
    expect(deleteBackup(entry.name)).toBe(true);
    expect(fs.existsSync(path.join(backupsDir(), entry.name))).toBe(false);
    expect(fs.existsSync(getDbFilePath())).toBe(true);
  });

  it("tracks the in-progress flag on globalThis, not plain module state (F4)", async () => {
    // Separate route bundles are not guaranteed to share a module instance,
    // so the lock must live on globalThis the same way the DB singleton does.
    const flag = () => (globalThis as { __thumbgen_backup_running?: boolean }).__thumbgen_backup_running;
    expect(flag()).toBeFalsy();
    const running = createBackup(new Date(2026, 8, 16, 15, 30, 0));
    expect(flag()).toBe(true);
    await running;
    expect(flag()).toBe(false);
  });

  it("removes a partial backup file when db.backup() throws, then rethrows (F4)", async () => {
    const db = getDb();
    const spy = vi.spyOn(db, "backup").mockImplementation(async (destPath: string) => {
      // better-sqlite3 writes progressively — a real failure (disk full,
      // I/O error) can leave a partial file behind before rejecting.
      fs.writeFileSync(destPath, "partial-and-broken");
      throw new Error("simulated disk full");
    });

    await expect(createBackup(new Date(2026, 8, 16, 16, 0, 0))).rejects.toThrow("simulated disk full");

    const files = fs.existsSync(backupsDir()) ? fs.readdirSync(backupsDir()) : [];
    expect(files).toHaveLength(0);
    expect(listBackups().map((b) => b.name)).not.toContain("thumbgen-20260916-160000.db");

    spy.mockRestore();

    // The lock must also be released so a later backup still succeeds.
    const entry = await createBackup(new Date(2026, 8, 16, 16, 0, 1));
    expect(entry.size).toBeGreaterThan(0);
  });
});

describe("cleanup", () => {
  it("counts and deletes only unattached rows older than 24 h, then vacuums", () => {
    const oldUpload = insertUpload(25, 0);
    const recentUpload = insertUpload(1, 0);
    const attachedUpload = insertUpload(99, 1);
    const oldSketch = insertSketch(30, 0);
    const recentSketch = insertSketch(2, 0);
    const attachedSketch = insertSketch(99, 1);

    expect(countCleanupCandidates()).toEqual({ sketches: 1, chatUploads: 1 });

    const result = runCleanup();
    expect(result.deletedSketches).toBe(1);
    expect(result.deletedChatUploads).toBe(1);
    expect(result.bytesBefore).toBeGreaterThan(0);
    expect(result.bytesAfter).toBeGreaterThan(0);

    expect(exists("chat_uploads", oldUpload)).toBe(false);
    expect(exists("chat_uploads", recentUpload)).toBe(true);
    expect(exists("chat_uploads", attachedUpload)).toBe(true);
    expect(exists("generated_sketches", oldSketch)).toBe(false);
    expect(exists("generated_sketches", recentSketch)).toBe(true);
    expect(exists("generated_sketches", attachedSketch)).toBe(true);
    expect(countCleanupCandidates()).toEqual({ sketches: 0, chatUploads: 0 });
  });
});
