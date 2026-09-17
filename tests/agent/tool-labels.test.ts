import { describe, it, expect, vi } from "vitest";

vi.mock("youtube-transcript", () => ({
  YoutubeTranscript: { fetchTranscript: vi.fn(async () => []) },
}));

import "@/lib/agent/tools/all";
import { listTools } from "@/lib/agent/tools";
import { TOOL_LABELS, toolLabel } from "@/lib/agent/tool-labels";

describe("tool labels", () => {
  it("label every registered tool and both client requests", () => {
    const names = [...listTools().map((tool) => tool.name), "request_user_image", "request_user_sketch"];
    for (const name of names) expect(TOOL_LABELS[name], name).toBeTruthy();
  });

  it("say what the agent is doing", () => {
    expect(toolLabel("get_canvas_state")).toBe("Lit le canvas");
    expect(toolLabel("view_canvas_images")).toBe("Regarde les images du canvas");
    expect(toolLabel("search_youtube")).toBe("Cherche sur YouTube");
    expect(toolLabel("generate_sketch")).toBe("Dessine le croquis");
    expect(toolLabel("apply_workflow")).toBe("Construit le workflow");
    expect(toolLabel("import_youtube_thumbnail")).toBe("Importe la miniature");
    expect(toolLabel("list_personas")).toBe("Liste tes personnages");
    expect(toolLabel("finish_turn")).toBe("Rédige la réponse");
  });

  it("fall back to a readable tool name", () => {
    expect(toolLabel("web_fetch")).toBe("web fetch");
  });
});
