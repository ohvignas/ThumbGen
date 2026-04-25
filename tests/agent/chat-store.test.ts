import { describe, it, expect, beforeEach } from "vitest";
import { useChatStore } from "@/store/chat-store";

beforeEach(() => useChatStore.getState().reset());

describe("chat store", () => {
  it("starts closed with no conversation, no draft, no attachments", () => {
    const s = useChatStore.getState();
    expect(s.isOpen).toBe(false);
    expect(s.activeConversationId).toBeNull();
    expect(s.draft).toBe("");
    expect(s.attachments).toEqual([]);
  });

  it("toggles open/close", () => {
    useChatStore.getState().toggle();
    expect(useChatStore.getState().isOpen).toBe(true);
    useChatStore.getState().toggle();
    expect(useChatStore.getState().isOpen).toBe(false);
  });

  it("setActive clears draft and attachments", () => {
    useChatStore.setState({ draft: "hello", attachments: [{ source: "uploaded:x", preview_url: "/x" }] });
    useChatStore.getState().setActive("conv-1");
    expect(useChatStore.getState().activeConversationId).toBe("conv-1");
    expect(useChatStore.getState().draft).toBe("");
    expect(useChatStore.getState().attachments).toEqual([]);
  });

  it("addAttachment is idempotent on source", () => {
    useChatStore.getState().addAttachment({ source: "uploaded:a", preview_url: "/a" });
    useChatStore.getState().addAttachment({ source: "uploaded:a", preview_url: "/a-copy" });
    expect(useChatStore.getState().attachments).toHaveLength(1);
  });

  it("removeAttachment removes the matching source only", () => {
    useChatStore.getState().addAttachment({ source: "uploaded:a", preview_url: "/a" });
    useChatStore.getState().addAttachment({ source: "uploaded:b", preview_url: "/b" });
    useChatStore.getState().removeAttachment("uploaded:a");
    expect(useChatStore.getState().attachments.map((x) => x.source)).toEqual(["uploaded:b"]);
  });

  it("clearAttachments empties the array but leaves draft", () => {
    useChatStore.setState({ draft: "keep me", attachments: [{ source: "uploaded:a", preview_url: "/a" }] });
    useChatStore.getState().clearAttachments();
    expect(useChatStore.getState().attachments).toEqual([]);
    expect(useChatStore.getState().draft).toBe("keep me");
  });
});
