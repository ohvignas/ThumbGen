import { describe, it, expect } from "vitest";
import {
  toolsToOpenAI,
  persistedMessagesToOpenAI,
  contentBlocksToOpenAIContent,
  type AnthropicBlock,
  type OpenAIMessage,
} from "@/lib/agent/translate";

describe("toolsToOpenAI", () => {
  it("wraps Anthropic-style tool specs in OpenAI function envelope", () => {
    const out = toolsToOpenAI([
      { name: "get_weather", description: "Returns weather", input_schema: { type: "object", properties: { city: { type: "string" } }, required: ["city"] } },
    ]);
    expect(out).toEqual([
      {
        type: "function",
        function: {
          name: "get_weather",
          description: "Returns weather",
          parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"] },
        },
      },
    ]);
  });
});

describe("contentBlocksToOpenAIContent", () => {
  it("converts a text-only blocks array to a string", () => {
    expect(contentBlocksToOpenAIContent([{ type: "text", text: "hello" }])).toBe("hello");
  });

  it("converts mixed text+image blocks to OpenAI content parts array", () => {
    const out = contentBlocksToOpenAIContent([
      { type: "text", text: "what is this" },
      { type: "image", source: { type: "base64", media_type: "image/png", data: "AAAA" } },
    ]);
    expect(out).toEqual([
      { type: "text", text: "what is this" },
      { type: "image_url", image_url: { url: "data:image/png;base64,AAAA" } },
    ]);
  });
});

describe("persistedMessagesToOpenAI", () => {
  it("translates a simple user→assistant text exchange", () => {
    const persisted: Array<{ role: "user" | "assistant"; content: AnthropicBlock[] }> = [
      { role: "user", content: [{ type: "text", text: "hi" }] },
      { role: "assistant", content: [{ type: "text", text: "hello!" }] },
    ];
    const out: OpenAIMessage[] = persistedMessagesToOpenAI(persisted);
    expect(out).toEqual([
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello!" },
    ]);
  });

  it("converts assistant tool_use blocks into a tool_calls array on one assistant message", () => {
    const persisted: Array<{ role: "user" | "assistant"; content: AnthropicBlock[] }> = [
      {
        role: "assistant",
        content: [
          { type: "text", text: "let me check" },
          { type: "tool_use", id: "toolu_1", name: "get_weather", input: { city: "Paris" } },
          { type: "tool_use", id: "toolu_2", name: "get_time", input: {} },
        ],
      },
    ];
    const out = persistedMessagesToOpenAI(persisted);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({
      role: "assistant",
      content: "let me check",
      tool_calls: [
        { id: "toolu_1", type: "function", function: { name: "get_weather", arguments: JSON.stringify({ city: "Paris" }) } },
        { id: "toolu_2", type: "function", function: { name: "get_time", arguments: JSON.stringify({}) } },
      ],
    });
  });

  it("converts user tool_result blocks into role=tool messages, one per result", () => {
    const persisted: Array<{ role: "user" | "assistant"; content: AnthropicBlock[] }> = [
      {
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: "toolu_1", content: [{ type: "text", text: "Paris: 18°C" }] },
          { type: "tool_result", tool_use_id: "toolu_2", content: "12:34" },
        ],
      },
    ];
    const out = persistedMessagesToOpenAI(persisted);
    expect(out).toEqual([
      { role: "tool", tool_call_id: "toolu_1", content: "Paris: 18°C" },
      { role: "tool", tool_call_id: "toolu_2", content: "12:34" },
    ]);
  });

  it("preserves images attached inside a tool_result content array", () => {
    const persisted: Array<{ role: "user" | "assistant"; content: AnthropicBlock[] }> = [
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "toolu_1",
            content: [
              { type: "text", text: "here is the chart" },
              { type: "image", source: { type: "base64", media_type: "image/png", data: "BBBB" } },
            ],
          },
        ],
      },
    ];
    const out = persistedMessagesToOpenAI(persisted);
    expect(out).toEqual([
      {
        role: "tool",
        tool_call_id: "toolu_1",
        content: [
          { type: "text", text: "here is the chart" },
          { type: "image_url", image_url: { url: "data:image/png;base64,BBBB" } },
        ],
      },
    ]);
  });
});
