import { describe, it, expect } from "vitest";
import { agentSurfaceFromProjectId, refuseWrongSurface } from "@/lib/studio/agent-surface";

describe("agent surface guard", () => {
  it("maps studio: ids to studio and everything else to canvas", () => {
    expect(agentSurfaceFromProjectId("studio:vid_abc")).toBe("studio");
    expect(agentSurfaceFromProjectId("proj_1")).toBe("canvas");
    expect(agentSurfaceFromProjectId(undefined)).toBe("canvas");
  });

  it("refuses croquis tools on a writing fiche and studio fill tools on a canvas", () => {
    const sketch = refuseWrongSurface("generate_sketch", "studio:vid_abc");
    expect(sketch?.isError).toBe(true);
    expect((sketch?.content[0] as { text: string }).text).toMatch(/Vidéos|studio|écriture/i);
    expect((sketch?.content[0] as { text: string }).text).not.toMatch(/Étape\s+\d/);

    const upsert = refuseWrongSurface("upsert_studio_script", "proj_1");
    expect(upsert?.isError).toBe(true);
    expect((upsert?.content[0] as { text: string }).text).toMatch(/miniature|canvas/i);

    expect(refuseWrongSurface("retrieve_own_corpus", "studio:vid_abc")).toBeNull();
    expect(refuseWrongSurface("retrieve_own_corpus", "proj_1")).toBeNull();
    expect(refuseWrongSurface("ask_user", "studio:vid_abc")).toBeNull();
    expect(refuseWrongSurface("get_my_channel_knowledge", "studio:vid_abc")).toBeNull();
    expect(refuseWrongSurface("link_studio_miniature", "proj_1")?.isError).toBe(true);
  });
});
