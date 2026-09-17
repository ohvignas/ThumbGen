import { describe, it, expect } from "vitest";
import type { UIMessage } from "ai";
import fs from "fs";
import path from "path";
import { answeringAfterFailedSend, pendingClientToolPart, shouldReloadAfterFailedAnswer } from "@/components/panels/chat/chat-view-model";

const question = { type: "tool-ask_user", toolCallId: "q1", state: "input-available", input: {} };
const assistant = (parts: unknown[], metadata?: unknown): UIMessage =>
  ({ id: "a1", role: "assistant", parts, ...(metadata ? { metadata } : {}) }) as unknown as UIMessage;

describe("pendingClientToolPart", () => {
  it("offers an unanswered client request of the last assistant message", () => {
    expect(pendingClientToolPart([assistant([question])], { stoppedLive: false })?.toolCallId).toBe("q1");
    expect(
      pendingClientToolPart([assistant([{ type: "tool-request_user_image", toolCallId: "r1", state: "input-available", input: {} }])], {
        stoppedLive: false,
      })?.toolCallId,
    ).toBe("r1");
  });

  it("offers nothing for an answered, streaming or server tool part, or a user last message", () => {
    expect(pendingClientToolPart([assistant([{ ...question, state: "output-available" }])], { stoppedLive: false })).toBeUndefined();
    expect(pendingClientToolPart([assistant([{ ...question, state: "input-streaming" }])], { stoppedLive: false })).toBeUndefined();
    expect(pendingClientToolPart([assistant([{ ...question, type: "tool-list_logos" }])], { stoppedLive: false })).toBeUndefined();
    expect(pendingClientToolPart([{ id: "u", role: "user", parts: [] } as UIMessage], { stoppedLive: false })).toBeUndefined();
  });

  it("never offers the request of an interrupted or stopped turn", () => {
    expect(pendingClientToolPart([assistant([question], { interrupted: true })], { stoppedLive: false })).toBeUndefined();
    expect(pendingClientToolPart([assistant([question])], { stoppedLive: true })).toBeUndefined();
  });
});

describe("shouldReloadAfterFailedAnswer", () => {
  it("reloads when the continuation of an answer fails, except for a 409 (handled by its own recovery)", () => {
    const base = { previousStatus: "submitted" as const, status: "error" as const, answering: true, busyConflict: false };
    expect(shouldReloadAfterFailedAnswer(base)).toBe(true);
    expect(shouldReloadAfterFailedAnswer({ ...base, previousStatus: "streaming" })).toBe(true);
    expect(shouldReloadAfterFailedAnswer({ ...base, busyConflict: true })).toBe(false);
    expect(shouldReloadAfterFailedAnswer({ ...base, answering: false })).toBe(false);
    expect(shouldReloadAfterFailedAnswer({ ...base, status: "ready" })).toBe(false);
    expect(shouldReloadAfterFailedAnswer({ ...base, previousStatus: "ready" })).toBe(false);
  });
});

describe("answeringAfterFailedSend", () => {
  it("forgets the answer being sent when its sending rejects, never another one", () => {
    expect(answeringAfterFailedSend({ conversationId: "c1", toolCallId: "q1" }, "q1")).toBeNull();
    const other = { conversationId: "c1", toolCallId: "q2" };
    expect(answeringAfterFailedSend(other, "q1")).toBe(other);
    expect(answeringAfterFailedSend(null, "q1")).toBeNull();
  });

  it("is applied in ChatPanel's rejection path", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/components/panels/ChatPanel.tsx"), "utf8");
    expect(source).toContain("answeringRef.current = answeringAfterFailedSend(answeringRef.current, toolCallId);");
  });
});
