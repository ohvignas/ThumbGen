import { describe, it, expect, beforeAll } from "vitest";
import { listPastGenerationsTool } from "@/lib/agent/tools/list-past-generations";
import { getDb } from "@/lib/db";
import { v4 as uuid } from "uuid";

describe("list_past_generations", () => {
  const projectId = uuid();
  const genId = uuid();
  const imgId1 = uuid();
  const imgId2 = uuid();

  beforeAll(() => {
    getDb().prepare("DELETE FROM generations_log").run();
    getDb().prepare("DELETE FROM generated_images").run();

    // Insert two generated images
    getDb()
      .prepare("INSERT INTO generated_images (id, mime_type, data) VALUES (?, ?, ?)")
      .run(imgId1, "image/png", Buffer.alloc(10));
    getDb()
      .prepare("INSERT INTO generated_images (id, mime_type, data) VALUES (?, ?, ?)")
      .run(imgId2, "image/png", Buffer.alloc(10));

    // Insert a generation log entry
    getDb()
      .prepare(
        `INSERT INTO generations_log (id, provider, model, endpoint, project_id, prompt, generated_image_ids)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        genId,
        "openai",
        "dall-e-3",
        "/api/generate/openai",
        projectId,
        "A dramatic YouTube thumbnail",
        `${imgId1},${imgId2}`
      );
  });

  it("returns text content listing past generations", async () => {
    const r = await listPastGenerationsTool.handler({ project_id: projectId });
    expect(r.content[0].type).toBe("text");
    const text = (r.content[0] as { text: string }).text;
    expect(text).toContain("dall-e-3");
    expect(text).toContain("A dramatic YouTube thumbnail");
    expect(text).toContain(`stored:gi_${imgId1}`);
    expect(text).toContain(`stored:gi_${imgId2}`);
  });

  it("returns 'No generations' when none match project", async () => {
    const r = await listPastGenerationsTool.handler({ project_id: "non-existent-id" });
    expect((r.content[0] as { text: string }).text).toMatch(/No generations/);
  });

  it("respects the limit parameter", async () => {
    // Insert extra rows for the same project
    for (let i = 0; i < 5; i++) {
      getDb()
        .prepare(
          `INSERT INTO generations_log (id, provider, model, endpoint, project_id)
           VALUES (?, ?, ?, ?, ?)`
        )
        .run(uuid(), "openai", "dall-e-3", "/api/generate/openai", projectId);
    }
    const r = await listPastGenerationsTool.handler({ project_id: projectId, limit: 3 });
    const text = (r.content[0] as { text: string }).text;
    // "3 generation(s):" should be in the header
    expect(text).toMatch(/^3 generation/);
  });
});
