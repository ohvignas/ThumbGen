import { describe, expect, it } from "vitest";
import {
  GEMINI_OPENROUTER_PROVIDER,
  omitGeminiThoughtSignatures,
} from "@/lib/agent/v2/gemini-thought-signatures";

const unsignedGeminiDetails = [
  { type: "reasoning.text", format: "google-gemini-v1", text: "planning the tool call" },
  { type: "reasoning.encrypted", format: "google-gemini-v1", data: "stale-blob", id: "tool_read_skill_1", index: 0 },
];

describe("omitGeminiThoughtSignatures", () => {
  it("keeps tool calls and drops unsigned Gemini reasoning so OpenRouter will not replay a corrupt sequence", () => {
    const messages = [
      { role: "user", content: [{ type: "text", text: "Fais un croquis" }] },
      {
        role: "assistant",
        content: [
          { type: "reasoning", text: "Je lis la skill.", providerOptions: { openrouter: { reasoning_details: unsignedGeminiDetails } } },
          {
            type: "tool-call",
            toolCallId: "call_1",
            toolName: "read_skill",
            input: { name: "generate_sketch" },
            providerOptions: { openrouter: { reasoning_details: unsignedGeminiDetails } },
          },
        ],
        providerOptions: { openrouter: { reasoning_details: unsignedGeminiDetails, annotations: [] } },
      },
      {
        role: "tool",
        content: [{ type: "tool-result", toolCallId: "call_1", toolName: "read_skill", output: { type: "json", value: { ok: true } } }],
      },
    ];

    expect(omitGeminiThoughtSignatures(messages)).toEqual([
      { role: "user", content: [{ type: "text", text: "Fais un croquis" }] },
      {
        role: "assistant",
        content: [
          {
            type: "tool-call",
            toolCallId: "call_1",
            toolName: "read_skill",
            input: { name: "generate_sketch" },
          },
        ],
        providerOptions: { openrouter: { annotations: [] } },
      },
      {
        role: "tool",
        content: [{ type: "tool-result", toolCallId: "call_1", toolName: "read_skill", output: { type: "json", value: { ok: true } } }],
      },
    ]);
  });

  it("drops a reasoning-only assistant message so the request does not end on a model turn", () => {
    expect(
      omitGeminiThoughtSignatures([
        { role: "user", content: [{ type: "text", text: "hello" }] },
        { role: "assistant", content: [{ type: "reasoning", text: "…" }] },
        { role: "user", content: [{ type: "text", text: "retry" }] },
      ]),
    ).toEqual([
      { role: "user", content: [{ type: "text", text: "hello" }] },
      { role: "user", content: [{ type: "text", text: "retry" }] },
    ]);
  });

  it("pins Gemini to Google AI Studio without mid-turn fallbacks", () => {
    expect(GEMINI_OPENROUTER_PROVIDER).toEqual({ order: ["Google AI Studio"], allow_fallbacks: false });
  });
});
