import { describe, it, expect, beforeAll } from "vitest";
import { resolveImageSource, markAttached } from "@/lib/agent/tools/_helpers/image-source";
import { getDb } from "@/lib/db";
import { v4 as uuid } from "uuid";

describe("resolveImageSource", () => {
  let logoId: string;
  let uploadId: string;
  let sketchId: string;

  beforeAll(() => {
    logoId = uuid();
    getDb()
      .prepare("INSERT INTO logos (id, label, mime_type, size, data) VALUES (?, ?, ?, ?, ?)")
      .run(logoId, "Test", "image/png", 4, Buffer.from([0, 0, 0, 0]));

    uploadId = `up_${uuid().replace(/-/g, "")}`;
    getDb()
      .prepare("INSERT INTO chat_uploads (id, mime_type, size, data) VALUES (?, ?, ?, ?)")
      .run(uploadId, "image/jpeg", 3, Buffer.from([1, 2, 3]));

    sketchId = `sk_${uuid().replace(/-/g, "")}`;
    getDb()
      .prepare("INSERT INTO generated_sketches (id, prompt, mime_type, data) VALUES (?, ?, ?, ?)")
      .run(sketchId, "test", "image/png", Buffer.from([4, 5, 6]));
  });

  it("resolves a stored:lg_ source", async () => {
    const r = await resolveImageSource(`stored:lg_${logoId}`);
    expect(r.mimeType).toBe("image/png");
    expect(r.bytes.length).toBe(4);
  });

  it("resolves an uploaded: source", async () => {
    const r = await resolveImageSource(`uploaded:${uploadId}`);
    expect(r.mimeType).toBe("image/jpeg");
    expect(r.bytes.length).toBe(3);
  });

  it("resolves a generated: source", async () => {
    const r = await resolveImageSource(`generated:${sketchId}`);
    expect(r.mimeType).toBe("image/png");
    expect(r.bytes.length).toBe(3);
  });

  it("rejects an unknown stored source", async () => {
    await expect(resolveImageSource(`stored:lg_does-not-exist`)).rejects.toThrow();
  });

  it("decodes a data: source", async () => {
    const png1px = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9ZkqfO0AAAAASUVORK5CYII=";
    const r = await resolveImageSource(png1px);
    expect(r.mimeType).toBe("image/png");
    expect(r.bytes.length).toBeGreaterThan(0);
  });

  it("rejects an unsupported scheme", async () => {
    await expect(resolveImageSource("https://example.com/x.png")).rejects.toThrow();
  });
});

describe("markAttached", () => {
  it("marks an uploaded source as attached", () => {
    const id = `up_${uuid().replace(/-/g, "")}`;
    getDb()
      .prepare("INSERT INTO chat_uploads (id, mime_type, size, data) VALUES (?, ?, ?, ?)")
      .run(id, "image/png", 1, Buffer.from([0]));
    markAttached(`uploaded:${id}`);
    const row = getDb().prepare("SELECT attached FROM chat_uploads WHERE id = ?").get(id) as { attached: number };
    expect(row.attached).toBe(1);
  });

  it("marks a generated sketch as attached", () => {
    const id = `sk_${uuid().replace(/-/g, "")}`;
    getDb()
      .prepare("INSERT INTO generated_sketches (id, prompt, mime_type, data) VALUES (?, ?, ?, ?)")
      .run(id, "x", "image/png", Buffer.from([0]));
    markAttached(`generated:${id}`);
    const row = getDb().prepare("SELECT attached FROM generated_sketches WHERE id = ?").get(id) as { attached: number };
    expect(row.attached).toBe(1);
  });

  it("is a no-op for stored: sources (already permanent)", () => {
    expect(() => markAttached("stored:lg_xxx")).not.toThrow();
  });
});
