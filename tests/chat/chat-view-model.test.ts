import { describe, it, expect } from "vitest";
import type { UIMessage } from "ai";
import {
  belongsToLiveTurn,
  chatPinToBottomReason,
  conversationChangeEffects,
  groupConsecutiveMessages,
  lastUserMessageId,
  lastUserText,
  liveTurnStart,
  retryableUserText,
  shouldRefetchAfterResume,
  stoppedTurnPlacement,
  trailingAssistantRow,
} from "@/components/panels/chat/chat-view-model";

const msg = (id: string, role: "user" | "assistant", parts: unknown[] = []) => ({ id, role, parts }) as unknown as UIMessage;

describe("groupConsecutiveMessages", () => {
  it("groups consecutive messages of the same author, keyed by the first one", () => {
    const groups = groupConsecutiveMessages([msg("u1", "user"), msg("a1", "assistant"), msg("a2", "assistant"), msg("u2", "user")]);
    expect(groups.map((g) => [g.key, g.role, g.messages.map((m) => m.id)])).toEqual([
      ["u1", "user", ["u1"]],
      ["a1", "assistant", ["a1", "a2"]],
      ["u2", "user", ["u2"]],
    ]);
    expect(groupConsecutiveMessages([])).toEqual([]);
  });
});

describe("trailingAssistantRow", () => {
  const afterUser = [msg("a0", "assistant"), msg("u1", "user")];

  it("adds a row after a user message", () => {
    expect(trailingAssistantRow(afterUser, "submitted", null)).toBe("progress");
    expect(trailingAssistantRow(afterUser, "streaming", null)).toBe("progress");
    expect(trailingAssistantRow(afterUser, "error", null)).toBe("error");
    expect(trailingAssistantRow(afterUser, "ready", "trailing")).toBe("interrupted");
    expect(trailingAssistantRow(afterUser, "ready", null)).toBeNull();
    expect(trailingAssistantRow([msg("u1", "user"), msg("a1", "assistant")], "streaming", null)).toBeNull();
    expect(trailingAssistantRow([msg("u1", "user"), msg("a1", "assistant")], "ready", "last-message")).toBeNull();
  });

  it("adds a row to an empty list while a first send runs or fails (I1)", () => {
    expect(trailingAssistantRow([], "error", null)).toBe("error");
    expect(trailingAssistantRow([], "submitted", null)).toBe("progress");
    expect(trailingAssistantRow([], "ready", null)).toBeNull();
  });

  it("adds « Tour interrompu » after an older turn when the stopped turn produced nothing (I3)", () => {
    const olderTurn = [msg("u0", "user"), msg("a0", "assistant")];
    expect(trailingAssistantRow(olderTurn, "ready", "trailing")).toBe("interrupted");
    expect(trailingAssistantRow(olderTurn, "streaming", "trailing")).toBeNull();
  });
});

describe("live turn and stop (I3)", () => {
  const older = [msg("u0", "user"), msg("a0", "assistant")];

  it("never marks an assistant message older than the turn start as interrupted", () => {
    const start = liveTurnStart(older);
    expect(belongsToLiveTurn(older[1], start)).toBe(false);
    expect(stoppedTurnPlacement(older, true, start)).toBe("trailing");
    // …so the trailing row carries the interruption instead.
    expect(trailingAssistantRow(older, "ready", stoppedTurnPlacement(older, true, start))).toBe("interrupted");
  });

  it("marks the assistant message the stopped turn produced", () => {
    const start = liveTurnStart(older);
    const live = [...older, msg("u1", "user"), msg("a1", "assistant")];
    expect(stoppedTurnPlacement(live, true, start)).toBe("last-message");
    expect(stoppedTurnPlacement(live, false, start)).toBeNull();
    expect(stoppedTurnPlacement([...older, msg("u1", "user")], true, start)).toBe("trailing");
  });

  it("counts the resumed message of a client-request answer as part of the live turn", () => {
    const start = liveTurnStart(older, "a0");
    expect(stoppedTurnPlacement(older, true, start)).toBe("last-message");
  });

  it("keeps the previous behaviour when no turn start was recorded", () => {
    expect(stoppedTurnPlacement(older, true, null)).toBe("last-message");
  });
});

describe("lastUserText", () => {
  it("returns the text of the last user message", () => {
    const messages = [
      msg("u1", "user", [{ type: "text", text: "Premier" }]),
      msg("u2", "user", [{ type: "text", text: " Change " }, { type: "file", mediaType: "image/png", url: "data:," }, { type: "text", text: "le fond " }]),
      msg("a1", "assistant", [{ type: "text", text: "Réponse" }]),
    ];
    expect(lastUserText(messages)).toBe("Change le fond");
    expect(lastUserText([msg("u1", "user", [{ type: "file", mediaType: "image/png", url: "data:," }])])).toBe("");
    expect(lastUserText([])).toBe("");
  });
});

describe("lastUserMessageId", () => {
  it("returns the last user message id, or empty when there is none", () => {
    expect(lastUserMessageId([msg("u1", "user"), msg("a1", "assistant"), msg("u2", "user")])).toBe("u2");
    expect(lastUserMessageId([msg("u1", "user"), msg("a1", "assistant")])).toBe("u1");
    expect(lastUserMessageId([msg("a1", "assistant")])).toBe("");
    expect(lastUserMessageId([])).toBe("");
  });
});

describe("chatPinToBottomReason", () => {
  it("pins after a new user send and after the turn ends, not mid-stream", () => {
    expect(chatPinToBottomReason({ lastUserId: "u1", turnActive: false }, { lastUserId: "u2", turnActive: true })).toBe("send");
    expect(chatPinToBottomReason({ lastUserId: "u2", turnActive: true }, { lastUserId: "u2", turnActive: false })).toBe("turn-complete");
    expect(chatPinToBottomReason({ lastUserId: "u2", turnActive: true }, { lastUserId: "u2", turnActive: true })).toBeNull();
    expect(chatPinToBottomReason({ lastUserId: "u1", turnActive: false }, { lastUserId: "u1", turnActive: true })).toBeNull();
    expect(chatPinToBottomReason({ lastUserId: "u1", turnActive: false }, { lastUserId: "", turnActive: false })).toBeNull();
  });
});

describe("retryableUserText (I2)", () => {
  const user = msg("u1", "user", [{ type: "text", text: "Fais un croquis" }]);
  const answered = (state: string) => ({ type: "tool-request_user_image", toolCallId: "r1", state, input: {}, output: { source_ids: [] } });

  it("offers the last user text after a plain failed or interrupted turn", () => {
    expect(retryableUserText([user])).toBe("Fais un croquis");
    expect(retryableUserText([user, msg("a1", "assistant", [{ type: "text", text: "…" }])])).toBe("Fais un croquis");
    expect(retryableUserText([user, msg("a1", "assistant", [answered("input-available")])])).toBe("Fais un croquis");
  });

  it("offers nothing when the last turn went through an answered client request", () => {
    expect(retryableUserText([user, msg("a1", "assistant", [answered("output-available")])])).toBe("");
    // Reopened: the answered request and the interrupted continuation are two messages.
    expect(retryableUserText([user, msg("a1", "assistant", [answered("output-available")]), msg("a2", "assistant")])).toBe("");
    expect(retryableUserText([user, msg("a1", "assistant", [{ ...answered("output-error"), errorText: "x" }])])).toBe("");
  });

  it("ignores an answered request from an older turn", () => {
    const messages = [msg("u0", "user", [{ type: "text", text: "Avant" }]), msg("a0", "assistant", [answered("output-available")]), user];
    expect(retryableUserText(messages)).toBe("Fais un croquis");
  });
});

describe("conversationChangeEffects (I1, M3)", () => {
  it("keeps the live messages, error and stream of a conversation the send just created", () => {
    expect(conversationChangeEffects("c-new", "c-new")).toEqual({ stopRunningTurn: false, loadHistory: false });
  });

  it("stops a running stream and loads the history on any other change", () => {
    expect(conversationChangeEffects("c2", "c-new")).toEqual({ stopRunningTurn: true, loadHistory: true });
    expect(conversationChangeEffects("c2", null)).toEqual({ stopRunningTurn: true, loadHistory: true });
    expect(conversationChangeEffects(null, null)).toEqual({ stopRunningTurn: true, loadHistory: true });
  });
});

describe("shouldRefetchAfterResume (I4)", () => {
  const base = { previousStatus: "streaming" as const, status: "ready" as const, resumedConversationId: "c1", turnFailed: false };

  it("refetches once a resumed turn goes from busy to ready", () => {
    expect(shouldRefetchAfterResume(base)).toBe(true);
    expect(shouldRefetchAfterResume({ ...base, previousStatus: "submitted" })).toBe(true);
  });

  it("does not refetch without a resumed turn, a transition, or after a failure", () => {
    expect(shouldRefetchAfterResume({ ...base, resumedConversationId: null })).toBe(false);
    expect(shouldRefetchAfterResume({ ...base, previousStatus: "ready" })).toBe(false);
    expect(shouldRefetchAfterResume({ ...base, status: "streaming" })).toBe(false);
    expect(shouldRefetchAfterResume({ ...base, status: "error" })).toBe(false);
    expect(shouldRefetchAfterResume({ ...base, turnFailed: true })).toBe(false);
  });
});
