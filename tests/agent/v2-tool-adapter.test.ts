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
    // `data` must be the tagged FileData object ({type:"data", data}), not a
    // bare string — a bare string matches AI SDK's message-level FilePart
    // shorthand (auto-normalized by ai@7.0.99's own standardizePrompt) but
    // NOT the separate schema a tool result's `output.value[]` items are
    // validated against, where `type:"file"` strictly requires `data` to
    // already be tagged. Confirmed live: the bare-string shape passed this
    // test yet made every image-bearing tool result (e.g. search_youtube's
    // thumbnail gallery) fail real ModelMessage[] validation with "Invalid
    // input: expected object, received string" on the very next model turn
    // — see tool-adapter.ts's toModelOutput comment and task-14-report.md's
    // Bug 2 write-up for the full trace.
    expect(out).toEqual({
      type: "content",
      value: [
        { type: "text", text: "hello" },
        { type: "file", mediaType: "image/png", data: { type: "data", data: "AAA=" } },
      ],
    });
  });
});
