import { describe, it, expect, vi } from "vitest";

// youtube-transcript ships a CJS bundle that breaks under Vitest's ESM transform.
// Mock it before importing any tool that depends on it.
vi.mock("youtube-transcript", () => ({
  YoutubeTranscript: {
    fetchTranscript: vi.fn(async () => []),
  },
}));

import "@/lib/agent/tools/all";  // populate
import { listTools } from "@/lib/agent/tools";

describe("full registry", () => {
  it("registers all expected tools", () => {
    const names = listTools().map((t) => t.name);
    const expected = [
      "list_logos",
      "list_personas",
      "list_swipe_files",
      "list_projects",
      "list_past_generations",
      "get_canvas_state",
      "view_canvas_images",
      "apply_workflow",
      "generate_sketch",
      "extract_youtube_script",
      "search_youtube",
      "search_youtube_channel",
      "get_channel_videos",
      "import_youtube_thumbnail",
      "get_my_channel_knowledge",
      "search_my_channel",
      "get_my_video",
      "list_studio_videos",
      "get_studio_video",
      "retrieve_own_corpus",
      "upsert_studio_script",
      "create_studio_video",
      "link_studio_miniature",
    ];
    for (const name of expected) {
      expect(names, `tool "${name}" should be registered`).toContain(name);
    }
  });

  it("every tool has a description and an input schema", () => {
    for (const tool of listTools()) {
      expect(tool.description, `${tool.name} missing description`).toBeTruthy();
      expect(tool.description.length, `${tool.name} description too short`).toBeGreaterThan(20);
      expect(tool.inputSchema, `${tool.name} missing inputSchema`).toBeTruthy();
    }
  });

  it("no longer offers single face photos to the agent", () => {
    const tools = listTools();
    expect(tools.map((t) => t.name)).not.toContain("list_face_reactions");
    for (const tool of tools) {
      expect(tool.description, tool.name).not.toMatch(/list_face_reactions|stored:fr_/);
    }
  });
});
