import { describe, it, expect, vi } from "vitest";

// youtube-transcript ships a CJS bundle that breaks under Vitest's ESM transform.
vi.mock("youtube-transcript", () => ({
  YoutubeTranscript: { fetchTranscript: vi.fn(async () => []) },
}));

import { readSkillTool } from "@/lib/agent/tools/read-skill";
import { listSkillCatalog } from "@/lib/agent/skills/catalog";
import "@/lib/agent/tools/all";

describe("read_skill", () => {
  it("returns the markdown body for a known skill", async () => {
    const result = await readSkillTool.handler({ name: "finish_turn" });
    expect(result.isError).toBeFalsy();
    const text = result.content.map((part) => ("text" in part ? part.text : "")).join("");
    expect(text).not.toMatch(/^---/);
    expect(text.length).toBeGreaterThan(20);
  });

  it("refuses an unknown name and lists the catalog", async () => {
    const result = await readSkillTool.handler({ name: "not-a-skill" });
    expect(result.isError).toBe(true);
    const text = result.content.map((part) => ("text" in part ? part.text : "")).join("");
    expect(text).toContain("Unknown skill");
    expect(text).toContain(listSkillCatalog()[0].name);
  });
});
