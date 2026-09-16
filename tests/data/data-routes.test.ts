import { describe, it, expect, beforeEach, vi } from "vitest";
import fs from "fs";
import { backupsDir } from "@/lib/data-admin";
import { GET as statsGet } from "@/app/api/data/stats/route";
import { DELETE as backupsDelete, GET as backupsGet, POST as backupsPost } from "@/app/api/data/backups/route";
import { GET as downloadGet } from "@/app/api/data/backups/download/route";
import { GET as cleanupGet, POST as cleanupPost } from "@/app/api/data/cleanup/route";

beforeEach(() => {
  fs.rmSync(backupsDir(), { recursive: true, force: true });
});

describe("/api/data routes", () => {
  it("GET stats returns sizes and counts", async () => {
    const res = await statsGet();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.dbBytes).toBeGreaterThan(0);
    expect(typeof body.counts.projects).toBe("number");
  });

  it("creates, lists, downloads and deletes a backup", async () => {
    const created = await backupsPost();
    expect(created.status).toBe(201);
    const entry = (await created.json()) as { name: string; size: number };

    const list = (await (await backupsGet()).json()) as Array<{ name: string }>;
    expect(list.map((backup) => backup.name)).toContain(entry.name);

    const download = await downloadGet(
      new Request(`http://localhost/api/data/backups/download?name=${encodeURIComponent(entry.name)}`),
    );
    expect(download.status).toBe(200);
    expect(download.headers.get("content-disposition")).toBe(`attachment; filename="${entry.name}"`);
    expect(Number(download.headers.get("content-length"))).toBe(entry.size);
    expect((await download.arrayBuffer()).byteLength).toBe(entry.size);

    const deleted = await backupsDelete(
      new Request(`http://localhost/api/data/backups?name=${encodeURIComponent(entry.name)}`, { method: "DELETE" }),
    );
    expect(deleted.status).toBe(200);
    const after = (await (await backupsGet()).json()) as Array<{ name: string }>;
    expect(after.map((backup) => backup.name)).not.toContain(entry.name);
  });

  it("rejects names that are not in the backup list with 400", async () => {
    for (const name of ["../thumbgen.db", "thumbgen.db", "/etc/passwd", ""]) {
      const download = await downloadGet(
        new Request(`http://localhost/api/data/backups/download?name=${encodeURIComponent(name)}`),
      );
      expect(download.status).toBe(400);
      const deleted = await backupsDelete(
        new Request(`http://localhost/api/data/backups?name=${encodeURIComponent(name)}`, { method: "DELETE" }),
      );
      expect(deleted.status).toBe(400);
    }
  });

  it("returns 500 with an error message when the backup lookup fails", async () => {
    const readdirSpy = vi.spyOn(fs, "readdirSync").mockImplementation(() => {
      throw new Error("EIO: i/o error");
    });
    try {
      const download = await downloadGet(
        new Request("http://localhost/api/data/backups/download?name=thumbgen-20260101-000000.db"),
      );
      expect(download.status).toBe(500);
      const body = (await download.json()) as { error: string };
      expect(typeof body.error).toBe("string");
      expect(body.error.length).toBeGreaterThan(0);
    } finally {
      readdirSpy.mockRestore();
    }
  });

  it("GET cleanup counts candidates and POST runs the cleanup", async () => {
    const counts = await (await cleanupGet()).json();
    expect(counts).toEqual({ sketches: expect.any(Number), chatUploads: expect.any(Number) });
    const res = await cleanupPost();
    expect(res.status).toBe(200);
    const result = await res.json();
    expect(result).toEqual({
      deletedSketches: expect.any(Number),
      deletedChatUploads: expect.any(Number),
      bytesBefore: expect.any(Number),
      bytesAfter: expect.any(Number),
    });
  });
});
