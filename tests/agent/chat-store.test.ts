import { describe, it, expect, beforeEach } from "vitest";
import { useChatStore } from "@/store/chat-store";

beforeEach(() => useChatStore.getState().reset());

describe("chat store", () => {
  it("starts open (always-visible right panel) with no conversation, no draft, no attachments", () => {
    const s = useChatStore.getState();
    expect(s.isOpen).toBe(true);
    expect(s.activeConversationId).toBeNull();
    expect(s.draft).toBe("");
    expect(s.attachments).toEqual([]);
  });

  it("toggle/close are vestigial — kept for back-compat but always-visible", () => {
    // toggle still flips the flag (no-op on UI since ChatPanel doesn't read it
    // anymore), but verify the flag mechanics still work.
    useChatStore.getState().toggle();
    expect(useChatStore.getState().isOpen).toBe(false);
    useChatStore.getState().toggle();
    expect(useChatStore.getState().isOpen).toBe(true);
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
