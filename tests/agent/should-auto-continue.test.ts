import { describe, it, expect } from "vitest";
import { lastAssistantMessageIsCompleteWithClientToolCalls } from "@/components/panels/chat/should-auto-continue";
import type { UIMessage } from "ai";

function msg(role: string, parts: unknown[]): UIMessage {
  return { id: "m1", role, parts } as unknown as UIMessage;
}

describe("lastAssistantMessageIsCompleteWithClientToolCalls", () => {
  it("returns false when the last message isn't from the assistant", () => {
    const messages = [msg("user", [{ type: "text", text: "hi" }])];
    expect(lastAssistantMessageIsCompleteWithClientToolCalls({ messages })).toBe(false);
  });

  it("returns false with no messages", () => {
    expect(lastAssistantMessageIsCompleteWithClientToolCalls({ messages: [] })).toBe(false);
  });

  it("returns true when the last step's tool call is a resolved request_user_image", () => {
    const messages = [
      msg("assistant", [
        { type: "step-start" },
        { type: "tool-request_user_image", state: "output-available", toolCallId: "c1" },
      ]),
    ];
    expect(lastAssistantMessageIsCompleteWithClientToolCalls({ messages })).toBe(true);
  });

  it("returns true when the resolved client tool call errored (output-error still counts as complete)", () => {
    const messages = [
      msg("assistant", [
        { type: "step-start" },
        { type: "tool-request_user_sketch", state: "output-error", toolCallId: "c1" },
      ]),
    ];
    expect(lastAssistantMessageIsCompleteWithClientToolCalls({ messages })).toBe(true);
  });

  it("THE KEY REGRESSION CASE: returns false when the last step's only completed tool call is a SERVER tool, even though it's fully resolved", () => {
    const messages = [
      msg("assistant", [
        { type: "step-start" },
        { type: "tool-list_logos", state: "output-available", toolCallId: "c1" },
      ]),
    ];
    expect(lastAssistantMessageIsCompleteWithClientToolCalls({ messages })).toBe(false);
  });

  it("returns false when a client tool call in the last step is still pending (not yet resolved)", () => {
    const messages = [
      msg("assistant", [
        { type: "step-start" },
        { type: "tool-request_user_image", state: "input-available", toolCallId: "c1" },
      ]),
    ];
    expect(lastAssistantMessageIsCompleteWithClientToolCalls({ messages })).toBe(false);
  });

  it("returns true when the last step mixes a resolved server tool and a resolved client tool", () => {
    const messages = [
      msg("assistant", [
        { type: "step-start" },
        { type: "tool-list_logos", state: "output-available", toolCallId: "c1" },
        { type: "tool-request_user_image", state: "output-available", toolCallId: "c2" },
      ]),
    ];
    expect(lastAssistantMessageIsCompleteWithClientToolCalls({ messages })).toBe(true);
  });

  it("returns false when the last step mixes a resolved client tool with a STILL-PENDING server tool (not every invocation is complete)", () => {
    const messages = [
      msg("assistant", [
        { type: "step-start" },
        { type: "tool-request_user_image", state: "output-available", toolCallId: "c1" },
        { type: "tool-list_logos", state: "input-available", toolCallId: "c2" },
      ]),
    ];
    expect(lastAssistantMessageIsCompleteWithClientToolCalls({ messages })).toBe(false);
  });

  it("respects step boundaries: a resolved client tool call in an EARLIER step doesn't count if the LAST step only has a server tool", () => {
    const messages = [
      msg("assistant", [
        { type: "step-start" },
        { type: "tool-request_user_image", state: "output-available", toolCallId: "c1" },
        { type: "step-start" },
        { type: "tool-list_logos", state: "output-available", toolCallId: "c2" },
      ]),
    ];
    expect(lastAssistantMessageIsCompleteWithClientToolCalls({ messages })).toBe(false);
  });

  it("ignores provider-executed tool parts (e.g. web search) even if the type happened to collide", () => {
    const messages = [
      msg("assistant", [
        { type: "step-start" },
        { type: "tool-request_user_image", state: "output-available", toolCallId: "c1", providerExecuted: true },
      ]),
    ];
    expect(lastAssistantMessageIsCompleteWithClientToolCalls({ messages })).toBe(false);
  });

  it("returns false when the last step has no tool calls at all (plain text turn)", () => {
    const messages = [msg("assistant", [{ type: "step-start" }, { type: "text", text: "Voici la réponse." }])];
    expect(lastAssistantMessageIsCompleteWithClientToolCalls({ messages })).toBe(false);
  });
});
