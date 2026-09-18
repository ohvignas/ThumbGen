import { describe, it, expect, vi } from "vitest";

vi.mock("youtube-transcript", () => ({
  YoutubeTranscript: { fetchTranscript: vi.fn(async () => []) },
}));

import { SLASH_SKILLS, lookupSlashToken } from "@/lib/agent/skills/slash-catalog";
import { listSkillCatalog } from "@/lib/agent/skills/catalog";

describe("slash catalog", () => {
  it("exposes croquis as the only sketch workflow, mapped to generate_sketch", () => {
    const croquis = SLASH_SKILLS.find((row) => row.slash === "croquis");
    expect(croquis).toEqual(
      expect.objectContaining({
        slash: "croquis",
        skill: "generate_sketch",
        title: "Croquis",
      }),
    );
    expect(SLASH_SKILLS.filter((row) => row.skill === "generate_sketch")).toHaveLength(1);
    expect(SLASH_SKILLS.some((row) => row.slash === "generate_sketch")).toBe(false);
  });

  it("is a subset of the SKILL.md catalog, with unique slashes", () => {
    const known = new Set(listSkillCatalog().map((skill) => skill.name));
    const slashes = SLASH_SKILLS.map((row) => row.slash);
    expect(new Set(slashes).size).toBe(slashes.length);
    expect(SLASH_SKILLS.length).toBeGreaterThanOrEqual(6);
    expect(SLASH_SKILLS.length).toBeLessThan(listSkillCatalog().length);
    for (const row of SLASH_SKILLS) {
      expect(known.has(row.skill), row.skill).toBe(true);
      expect(row.slash).toMatch(/^[a-z][a-z0-9-]{0,40}$/);
      expect(row.title.length).toBeGreaterThan(0);
      expect(row.description.length).toBeGreaterThan(0);
    }
  });

  it("looks up /croquis and the hidden /generate_sketch alias, not finish_turn", () => {
    expect(lookupSlashToken("croquis")?.skill).toBe("generate_sketch");
    expect(lookupSlashToken("Generate_Sketch")?.skill).toBe("generate_sketch");
    expect(lookupSlashToken("finish_turn")).toBeNull();
    expect(lookupSlashToken("")).toBeNull();
  });

  it("exposes create-prompt with a create-propt alias, mapped to the create-prompt skill", () => {
    const row = SLASH_SKILLS.find((entry) => entry.slash === "create-prompt");
    expect(row).toEqual(
      expect.objectContaining({
        slash: "create-prompt",
        skill: "create-prompt",
        title: "Create prompt",
        aliases: ["create-propt"],
      }),
    );
    expect(SLASH_SKILLS.filter((entry) => entry.skill === "create-prompt")).toHaveLength(1);
    expect(SLASH_SKILLS.some((entry) => entry.slash === "create-propt")).toBe(false);
    expect(lookupSlashToken("create-prompt")?.skill).toBe("create-prompt");
    expect(lookupSlashToken("create-propt")?.slash).toBe("create-prompt");
  });
});
