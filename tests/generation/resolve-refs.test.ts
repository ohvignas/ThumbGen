import { describe, it, expect, beforeAll } from "vitest";
import { getDb } from "@/lib/db";
import { v4 as uuid } from "uuid";
import { resolveGenerationImageUrl, resolveGenerationImageUrls } from "@/lib/generation/resolve-refs";

const PNG = Buffer.from([1, 2, 3, 4]);

describe("resolveGenerationImageUrl", () => {
  const giId = "gi-ref-1";
  const personaId = uuid();

  beforeAll(() => {
    getDb()
      .prepare("INSERT INTO generated_images (id, mime_type, data) VALUES (?, ?, ?)")
      .run(giId, "image/png", PNG);
    getDb().prepare("INSERT INTO personas (id, label) VALUES (?, ?)").run(personaId, "Resolver");
    getDb()
      .prepare("INSERT INTO persona_photos (id, persona_id, angle, mime_type, size, data) VALUES (?, ?, ?, ?, ?, ?)")
      .run(uuid(), personaId, "left", "image/jpeg", 3, Buffer.from([9, 10, 11]));
    getDb()
      .prepare("INSERT INTO persona_photos (id, persona_id, angle, mime_type, size, data) VALUES (?, ?, ?, ?, ?, ?)")
      .run(uuid(), personaId, "front", "image/png", PNG.length, PNG);
  });

  it("passes data URLs through", async () => {
    const data = "data:image/png;base64,AAAA";
    expect(await resolveGenerationImageUrl(data)).toBe(data);
  });

  it("loads stored:gi_ and /api/generated-images URLs from the DB", async () => {
    const fromRef = await resolveGenerationImageUrl(`stored:gi_${giId}`);
    const fromUrl = await resolveGenerationImageUrl(`/api/generated-images/image?id=${giId}`);
    expect(fromRef).toBe(`data:image/png;base64,${PNG.toString("base64")}`);
    expect(fromUrl).toBe(fromRef);
  });

  it("loads a persona angle URL, not just the front photo", async () => {
    const left = await resolveGenerationImageUrl(`/api/personas/image?id=${personaId}&angle=left`);
    expect(left).toBe("data:image/jpeg;base64,CQoL");
  });

  it("resolves a list and skips empty values", async () => {
    const urls = await resolveGenerationImageUrls([`stored:gi_${giId}`, ""]);
    expect(urls).toEqual([`data:image/png;base64,${PNG.toString("base64")}`]);
  });
});
