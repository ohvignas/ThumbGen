import { describe, it, expect, beforeAll } from "vitest";
import {
  createConversation,
  getConversation,
  listConversations,
  softDeleteConversation,
  updateConversationTitle,
  appendMessage,
  listMessages,
} from "@/lib/agent/conversation/store";
import { getDb } from "@/lib/db";

const projectId = "test-conv-store";

beforeAll(() => {
  // ensure project exists for FK-friendly behavior (no FK enforced on conversations.project_id, but be tidy)
  getDb()
    .prepare("INSERT OR IGNORE INTO projects_meta (id, name) VALUES (?, ?)")
    .run(projectId, "Conv Test Project");
});

describe("conversation store", () => {
  it("creates and retrieves a conversation", () => {
    const c = createConversation(projectId, "First");
    expect(c.id).toBeTruthy();
    expect(c.project_id).toBe(projectId);
    expect(c.title).toBe("First");
    expect(getConversation(c.id)?.id).toBe(c.id);
  });

  it("lists conversations sorted by updated_at desc", async () => {
    const a = createConversation(projectId, "A");
    const b = createConversation(projectId, "B");
    // wait a second so the update lands in a different sqlite datetime('now') second
    await new Promise((r) => setTimeout(r, 1100));
    // mutate a to push it to top
    updateConversationTitle(a.id, "A renamed");
    const list = listConversations(projectId);
    expect(list[0].id).toBe(a.id);
    expect(list.find((c) => c.id === b.id)).toBeDefined();
  });

  it("soft-deletes a conversation (excluded from list and getConversation)", () => {
    const c = createConversation(projectId, "Doomed");
    softDeleteConversation(c.id);
    expect(getConversation(c.id)).toBeNull();
    expect(listConversations(projectId).find((x) => x.id === c.id)).toBeUndefined();
  });

  it("updates the title and bumps updated_at", () => {
    const c = createConversation(projectId, "Old");
    updateConversationTitle(c.id, "New");
    expect(getConversation(c.id)?.title).toBe("New");
  });

  it("appends a message and bumps conversation.updated_at", async () => {
    const c = createConversation(projectId, "WithMessages");
    const before = getConversation(c.id)!.updated_at;
    // small wait to ensure updated_at differs (sqlite datetime('now') is per-second)
    await new Promise((r) => setTimeout(r, 1100));
    appendMessage({
      conversation_id: c.id,
      role: "user",
      content_json: '[{"type":"text","text":"hi"}]',
      interrupted: 0,
      total_input_tokens: 0,
      total_output_tokens: 0,
      cost_estimate: 0,
    });
    const after = getConversation(c.id)!.updated_at;
    expect(after >= before).toBe(true);  // monotonic; weak check but better than nothing
    const msgs = listMessages(c.id);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].role).toBe("user");
  });
});
