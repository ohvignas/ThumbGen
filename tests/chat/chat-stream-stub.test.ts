// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import { DefaultChatTransport, readUIMessageStream, type UIMessage } from "ai";
import { splitAssistantTurn } from "@/components/panels/chat/turn-model";
import { rowsToUIMessages } from "@/components/panels/chat/history-to-ui-messages";

const STUB_PATH = path.join(process.cwd(), "scripts/chat-fixtures/chat-stream-stub.js");

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("dev chat stream stub", () => {
  it("streams a finish_turn turn the chat parses, then serves the same turn to the history refetch", async () => {
    // No waiting: the stub's delays resolve immediately.
    vi.stubGlobal("setTimeout", (callback: () => void) => {
      callback();
      return 0;
    });
    // The "real" server has no stored row for this conversation.
    window.fetch = async () => new Response("[]", { headers: { "content-type": "application/json" } });
    expect((0, eval)(fs.readFileSync(STUB_PATH, "utf8"))).toBe("installed");

    const transport = new DefaultChatTransport({ api: "/api/agent/chat", fetch: (input, init) => window.fetch(input, init) });
    const stream = await transport.sendMessages({
      trigger: "submit-message",
      chatId: "chat",
      messageId: undefined,
      messages: [{ id: "u1", role: "user", parts: [{ type: "text", text: "Dessine un croquis" }] }],
      abortSignal: undefined,
      body: { conversation_id: "conv-1" },
    });
    let live: UIMessage | undefined;
    for await (const message of readUIMessageStream({ stream })) live = message;

    const liveTurn = splitAssistantTurn(live!);
    expect(liveTurn.hasFinishTurn).toBe(true);
    expect(liveTurn.stepCount).toBe(4);
    expect(liveTurn.results).toHaveLength(1);
    expect(liveTurn.nextActions).toEqual([]);

    const rows = await (await window.fetch("/api/agent/conversations/conv-1/messages")).json();
    const reopened = rowsToUIMessages(rows);
    expect(reopened.map((message) => message.role)).toEqual(["user", "assistant"]);
    const reopenedTurn = splitAssistantTurn(reopened[1]);
    expect(reopenedTurn.stepCount).toBe(4);
    expect(reopenedTurn.results).toHaveLength(1);
    expect(reopenedTurn.answer).toContain("visage choqué");
  });
});
