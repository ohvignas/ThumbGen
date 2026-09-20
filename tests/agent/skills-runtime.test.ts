import { describe, it, expect, vi } from "vitest";

// youtube-transcript ships a CJS bundle that breaks under Vitest's ESM transform.
vi.mock("youtube-transcript", () => ({
  YoutubeTranscript: { fetchTranscript: vi.fn(async () => []) },
}));

import { AGENT_SYSTEM_PROMPT, buildSystemMessages } from "@/lib/agent/system-prompt";
import { buildSkillsCatalogBlock, listSkillCatalog, readSkillBody } from "@/lib/agent/skills/catalog";
import { getTool, listTools } from "@/lib/agent/tools";
import "@/lib/agent/tools/all";

describe("agent skills runtime", () => {
  it("keeps the system prompt free of the 7-step journey", () => {
    for (const gone of ["THUMBNAIL JOURNEY", "STEPS\n1.", "Étape n/7", "Until then:", "trigger_generation", "GUIDED INTERVIEW"]) {
      expect(AGENT_SYSTEM_PROMPT, gone).not.toContain(gone);
    }
    expect(AGENT_SYSTEM_PROMPT).toContain("SKILLS");
    expect(AGENT_SYSTEM_PROMPT).toContain("read_skill");
    expect(AGENT_SYSTEM_PROMPT).toContain("thumbnail-packaging");
    expect(AGENT_SYSTEM_PROMPT).toContain("existing-workflow");
    expect(buildSystemMessages({ nodes: [], edges: [] }, "proj_1")[0].text).toBe(AGENT_SYSTEM_PROMPT);
  });

  it("lists every skill name+description and read_skill returns the body", () => {
    const catalog = listSkillCatalog();
    const names = new Set(catalog.map((skill) => skill.name));
    expect(catalog.length).toBeGreaterThanOrEqual(26);
    expect(names.has("update_brief")).toBe(false);
    for (const name of ["get_canvas_state", "apply_workflow", "generate_sketch", "create-prompt", "ask_user", "finish_turn", "thumbnail-packaging", "existing-workflow"]) {
      expect(names.has(name), name).toBe(true);
    }
    const body = readSkillBody("thumbnail-packaging");
    expect(body).toBeTruthy();
    expect(body!).not.toMatch(/^---/);
    expect(readSkillBody("not-a-skill")).toBeNull();
    expect(buildSkillsCatalogBlock()).toContain("get_canvas_state");
    const sketch = readSkillBody("generate_sketch") ?? "";
    expect(sketch).toContain("liveSketchCount");
    expect(sketch).not.toContain("limite de 5 esquisses atteinte pour cette miniature");
    expect(sketch).toContain("Deleted / tombstoned nodes");
  });

  it("registers read_skill as a chat-only tool", () => {
    const tool = getTool("read_skill");
    expect(tool?.chatOnly).toBe(true);
    expect(listTools().some((entry) => entry.name === "read_skill")).toBe(true);
  });
});
