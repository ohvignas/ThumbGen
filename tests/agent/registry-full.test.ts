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
      "list_face_reactions",
      "list_swipe_files",
      "list_projects",
      "list_past_generations",
      "get_canvas_state",
      "apply_workflow",
      "generate_sketch",
      "extract_youtube_script",
      "search_youtube",
      "search_youtube_channel",
      "get_channel_videos",
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
});
