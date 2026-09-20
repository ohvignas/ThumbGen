import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { TOOL_LABELS } from "@/lib/agent/tool-labels";
import { listSkillCatalog, readSkillBody } from "@/lib/agent/skills/catalog";

describe("update_brief is gone", () => {
  it("is not a registered tool, skill, or chat label", () => {
    expect(fs.existsSync(path.join(process.cwd(), "src/lib/agent/v2/update-brief-tool.ts"))).toBe(false);
    expect(fs.existsSync(path.join(process.cwd(), "src/lib/agent/skills/update_brief/SKILL.md"))).toBe(false);
    expect(TOOL_LABELS.update_brief).toBeUndefined();
    expect(listSkillCatalog().some((skill) => skill.name === "update_brief")).toBe(false);
    expect(readSkillBody("update_brief")).toBeNull();
  });
});
