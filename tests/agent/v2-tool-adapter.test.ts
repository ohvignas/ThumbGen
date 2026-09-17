import { describe, it, expect, vi } from "vitest";
import { toolModelMessageSchema } from "ai";

vi.mock("youtube-transcript", () => ({
  YoutubeTranscript: { fetchTranscript: vi.fn(async () => []) },
}));

// Deliberately NOT importing "@/lib/agent/tools/all" here — tool-adapter.ts
// now does that import itself (Task 14's Bug 1 fix), and this suite must
// exercise that real wiring rather than papering over a reverted fix with
// its own copy of the same import. Before the fix, this file (and
// v2-route-handler.test.ts) importing "@/lib/agent/tools/all" themselves is
// exactly what kept the suite green while the real chat route's tool
// registry was empty — see task-14-report.md.
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
    // A hand-written literal here would "agree" with either shape if
    // miscopied — assert against `ai`'s own real toolModelMessageSchema
    // instead (wrapping `out` into the full tool-result message it's
    // actually embedded in when a turn gets persisted/replayed), so this
    // test would genuinely fail on a regression to the old, buggy bare-
    // string `data` shape rather than just restating whatever the code
    // currently does. `data` must be the tagged FileData object
    // ({type:"data", data}), not a bare string — a bare string matches AI
    // SDK's message-level FilePart shorthand (auto-normalized by ai@7.0.99's
    // own standardizePrompt) but NOT the separate schema a tool result's
    // `output.value[]` items are validated against, where `type:"file"`
    // strictly requires `data` to already be tagged. Confirmed live: the
    // old bare-string shape made every image-bearing tool result (e.g.
    // search_youtube's thumbnail gallery) fail real ModelMessage[]
    // validation with "Invalid input: expected object, received string" on
    // the very next model turn — see tool-adapter.ts's toModelOutput
    // comment and task-14-report.md's Bug 2 write-up for the full trace.
    const wrapped = {
      role: "tool" as const,
      content: [{ type: "tool-result" as const, toolCallId: "t1", toolName: "list_logos", output: out }],
    };
    const parsed = toolModelMessageSchema.safeParse(wrapped);
    expect(parsed.success).toBe(true);
    expect(out).toEqual({
      type: "content",
      value: [
        { type: "text", text: "hello" },
        { type: "file", mediaType: "image/png", data: { type: "data", data: "AAA=" } },
      ],
    });
  });

  it("toModelOutput maps an isError result to error-text, so the failure survives persistence", () => {
    const tools = buildAiSdkTools();
    const out = tools.generate_sketch.toModelOutput!({
      toolCallId: "t1",
      input: {},
      output: {
        isError: true,
        content: [
          { type: "text" as const, text: "OpenRouter API error 500" },
          { type: "text" as const, text: "retry later" },
        ],
      },
    } as never);
    expect(out).toEqual({ type: "error-text", value: "OpenRouter API error 500\nretry later" });
    const wrapped = {
      role: "tool" as const,
      content: [{ type: "tool-result" as const, toolCallId: "t1", toolName: "generate_sketch", output: out }],
    };
    expect(toolModelMessageSchema.safeParse(wrapped).success).toBe(true);
  });

  it("toModelOutput keeps a successful visual result as content with its file part", () => {
    const tools = buildAiSdkTools();
    const out = tools.generate_sketch.toModelOutput!({
      toolCallId: "t1",
      input: {},
      output: {
        isError: false,
        content: [
          { type: "text" as const, text: "Sketch generated." },
          { type: "image" as const, mimeType: "image/png", data: "AAA=" },
          { type: "text" as const, text: "result_id: t1" },
        ],
      },
    } as never);
    expect(out).toEqual({
      type: "content",
      value: [
        { type: "text", text: "Sketch generated." },
        { type: "file", mediaType: "image/png", data: { type: "data", data: "AAA=" } },
        { type: "text", text: "result_id: t1" },
      ],
    });
  });
});
