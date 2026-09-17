import { describe, it, expect } from "vitest";
import type { UIMessage } from "ai";
import {
  CLIENT_TOOL_NAMES,
  CLIENT_TOOL_NAME_SET,
  clientToolNameOfPartType,
  isClientToolName,
} from "@/lib/agent/client-tools";
import { lastAssistantMessageIsCompleteWithClientToolCalls } from "@/components/panels/chat/should-auto-continue";
import { CLIENT_TOOL_NAMES as TURN_MODEL_CLIENT_TOOL_NAMES, splitAssistantTurn } from "@/components/panels/chat/turn-model";

const assistant = (parts: unknown[]): UIMessage => ({ id: "m1", role: "assistant", parts }) as unknown as UIMessage;

describe("client tools module", () => {
  it("lists the three client tools", () => {
    expect([...CLIENT_TOOL_NAMES]).toEqual(["request_user_image", "request_user_sketch", "ask_user"]);
    expect([...CLIENT_TOOL_NAME_SET]).toEqual([...CLIENT_TOOL_NAMES]);
    expect(isClientToolName("ask_user")).toBe(true);
    expect(isClientToolName("finish_turn")).toBe(false);
  });

  it("reads a client tool name from a UI part type", () => {
    expect(clientToolNameOfPartType("tool-ask_user")).toBe("ask_user");
    expect(clientToolNameOfPartType("tool-request_user_image")).toBe("request_user_image");
    expect(clientToolNameOfPartType("tool-list_logos")).toBeNull();
    expect(clientToolNameOfPartType("text")).toBeNull();
    expect(clientToolNameOfPartType("ask_user")).toBeNull();
  });

  it("is the set the turn model uses", () => {
    expect(TURN_MODEL_CLIENT_TOOL_NAMES.has("ask_user")).toBe(true);
  });

  it("auto-continues after an answered ask_user, never before", () => {
    const answered = assistant([{ type: "step-start" }, { type: "tool-ask_user", toolCallId: "q1", state: "output-available" }]);
    const waiting = assistant([{ type: "step-start" }, { type: "tool-ask_user", toolCallId: "q1", state: "input-available" }]);
    expect(lastAssistantMessageIsCompleteWithClientToolCalls({ messages: [answered] })).toBe(true);
    expect(lastAssistantMessageIsCompleteWithClientToolCalls({ messages: [waiting] })).toBe(false);
  });

  it("keeps an unanswered ask_user as a pending request, not a step", () => {
    const turn = splitAssistantTurn(
      assistant([
        { type: "text", text: "Première question." },
        { type: "tool-ask_user", toolCallId: "q1", state: "input-available", input: { question: "Quel angle ?" } },
      ]),
    );
    expect(turn.pending).toHaveLength(1);
    expect(turn.steps.some((step) => step.kind === "tool")).toBe(false);
  });
});
