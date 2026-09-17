import { describe, it, expect } from "vitest";
import type { UIMessage } from "ai";
import { groupConsecutiveMessages, lastUserText, trailingAssistantRow } from "@/components/panels/chat/chat-view-model";

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

  it("adds a row only after a user message", () => {
    expect(trailingAssistantRow(afterUser, "submitted", false)).toBe("progress");
    expect(trailingAssistantRow(afterUser, "streaming", false)).toBe("progress");
    expect(trailingAssistantRow(afterUser, "error", false)).toBe("error");
    expect(trailingAssistantRow(afterUser, "ready", true)).toBe("interrupted");
    expect(trailingAssistantRow(afterUser, "ready", false)).toBeNull();
    expect(trailingAssistantRow([msg("u1", "user"), msg("a1", "assistant")], "streaming", false)).toBeNull();
    expect(trailingAssistantRow([], "error", false)).toBeNull();
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
