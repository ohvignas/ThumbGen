import { describe, it, expect } from "vitest";
import type { UIMessage } from "ai";
import { createAutoContinueGuard } from "@/components/panels/chat/should-auto-continue";

const answered = (toolCallId: string, extra: unknown[] = []): UIMessage[] =>
  [
    { id: "u1", role: "user", parts: [{ type: "text", text: "go" }] },
    {
      id: "a1",
      role: "assistant",
      parts: [{ type: "step-start" }, ...extra, { type: "tool-ask_user", toolCallId, state: "output-available", input: {}, output: { answer: "x" } }],
    },
  ] as unknown as UIMessage[];

describe("createAutoContinueGuard", () => {
  it("lets one continuation through per answered toolCallId", () => {
    const guard = createAutoContinueGuard();
    expect(guard.shouldSend({ messages: answered("ask-1") })).toBe(true);
    expect(guard.shouldSend({ messages: answered("ask-1") })).toBe(false);
    expect(guard.shouldSend({ messages: answered("ask-2") })).toBe(true);
  });

  it("never sends when the base predicate says no", () => {
    const guard = createAutoContinueGuard();
    const pending = answered("ask-1");
    (pending[1].parts[1] as { state: string }).state = "input-available";
    expect(guard.shouldSend({ messages: pending })).toBe(false);
    // Not consumed: once answered it still goes through.
    expect(guard.shouldSend({ messages: answered("ask-1") })).toBe(true);
  });

  it("a released id (the send failed, the request is answered again) goes through once more", () => {
    const guard = createAutoContinueGuard();
    expect(guard.shouldSend({ messages: answered("ask-1") })).toBe(true);
    guard.release("ask-1");
    expect(guard.shouldSend({ messages: answered("ask-1") })).toBe(true);
    expect(guard.shouldSend({ messages: answered("ask-1") })).toBe(false);
    guard.clear();
    expect(guard.shouldSend({ messages: answered("ask-1") })).toBe(true);
  });
});
