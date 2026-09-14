import { describe, it, expect, vi } from "vitest";

vi.mock("youtube-transcript", () => ({
  YoutubeTranscript: { fetchTranscript: vi.fn(async () => []) },
}));

import "@/lib/agent/tools/all";
import { buildAiSdkTools } from "@/lib/agent/v2/tool-adapter";

describe("buildAiSdkTools", () => {
  it("wraps every registered tool, keyed by name", () => {
    const tools = buildAiSdkTools();
    expect(Object.keys(tools)).toContain("list_logos");
    expect(Object.keys(tools)).toContain("apply_workflow");
    expect(Object.keys(tools)).toContain("list_personas");
  });

  it("execute() calls straight into the real tool handler (no MCP round-trip)", async () => {
    const tools = buildAiSdkTools();
    const result = await tools.list_logos.execute!({}, { toolCallId: "t1" } as never);
    expect(result).toHaveProperty("content");
    expect(Array.isArray((result as { content: unknown[] }).content)).toBe(true);
  });

  it("toModelOutput maps text+image ToolContent into content/file parts", () => {
    const tools = buildAiSdkTools();
    const fake = {
      content: [
        { type: "text" as const, text: "hello" },
        { type: "image" as const, mimeType: "image/png", data: "AAA=" },
      ],
    };
    const out = tools.list_logos.toModelOutput!({
      toolCallId: "t1",
      input: {},
      output: fake,
    } as never);
    expect(out).toEqual({
      type: "content",
      value: [
        { type: "text", text: "hello" },
        { type: "file", mediaType: "image/png", data: "AAA=" },
      ],
    });
  });
});
