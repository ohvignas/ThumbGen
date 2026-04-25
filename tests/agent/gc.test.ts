import { describe, it, expect, beforeEach } from "vitest";
import { runGc, _stopGcLoop } from "@/lib/agent/gc";
import { getDb } from "@/lib/db";
import { v4 as uuid } from "uuid";

beforeEach(() => {
  // Defensive — make sure no leftover state from prior tests interferes.
  _stopGcLoop();
});

function insertUpload(opts: { ageHours: number; attached: 0 | 1 }): string {
  const id = `up_${uuid().replace(/-/g, "")}`;
  getDb()
    .prepare(
      "INSERT INTO chat_uploads (id, mime_type, size, data, attached, created_at) VALUES (?, ?, ?, ?, ?, datetime('now', ?))",
    )
    .run(id, "image/png", 1, Buffer.from([0]), opts.attached, `-${opts.ageHours} hours`);
  return id;
}

function insertSketch(opts: { ageHours: number; attached: 0 | 1 }): string {
  const id = `sk_${uuid().replace(/-/g, "")}`;
  getDb()
    .prepare(
      "INSERT INTO generated_sketches (id, prompt, mime_type, data, attached, created_at) VALUES (?, ?, ?, ?, ?, datetime('now', ?))",
    )
    .run(id, "test", "image/png", Buffer.from([0]), opts.attached, `-${opts.ageHours} hours`);
  return id;
}

function exists(table: "chat_uploads" | "generated_sketches", id: string): boolean {
  const row = getDb().prepare(`SELECT 1 FROM ${table} WHERE id = ?`).get(id);
  return Boolean(row);
}

describe("runGc", () => {
  it("deletes unattached uploads older than 24h", () => {
    const old = insertUpload({ ageHours: 25, attached: 0 });
    const recent = insertUpload({ ageHours: 1, attached: 0 });
    runGc();
    expect(exists("chat_uploads", old)).toBe(false);
    expect(exists("chat_uploads", recent)).toBe(true);
  });

  it("deletes unattached sketches older than 1h", () => {
    const old = insertSketch({ ageHours: 2, attached: 0 });
    const recent = insertSketch({ ageHours: 0, attached: 0 });
    runGc();
    expect(exists("generated_sketches", old)).toBe(false);
    expect(exists("generated_sketches", recent)).toBe(true);
  });

  it("preserves attached uploads even when old", () => {
    const oldAttached = insertUpload({ ageHours: 99, attached: 1 });
    runGc();
    expect(exists("chat_uploads", oldAttached)).toBe(true);
  });

  it("preserves attached sketches even when old", () => {
    const oldAttached = insertSketch({ ageHours: 99, attached: 1 });
    runGc();
    expect(exists("generated_sketches", oldAttached)).toBe(true);
  });

  it("returns the count of deleted rows", () => {
    insertUpload({ ageHours: 30, attached: 0 });
    insertUpload({ ageHours: 30, attached: 0 });
    insertSketch({ ageHours: 5, attached: 0 });
    const r = runGc();
    expect(r.uploads).toBeGreaterThanOrEqual(2);
    expect(r.sketches).toBeGreaterThanOrEqual(1);
  });

  it("is a no-op when nothing is expired", () => {
    insertUpload({ ageHours: 1, attached: 0 });
    insertSketch({ ageHours: 0, attached: 0 });
    const r = runGc();
    expect(r.uploads).toBe(0);
    expect(r.sketches).toBe(0);
  });
});
