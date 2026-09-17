import { describe, it, expect, vi } from "vitest";
import { v4 as uuid } from "uuid";

// The route sees the conversation (checked before the body is read), but it is gone at write time.
vi.mock("@/lib/agent/conversation/store", () => ({
  getConversation: (id: string) => ({ id, project_id: "proj-race", title: "t", created_at: "", updated_at: "", deleted_at: null }),
}));

import { PATCH } from "@/app/api/briefs/[conversationId]/route";
import { getDb } from "@/lib/db";
import { emptyBrief } from "@/lib/brief/schema";
import { getBrief } from "@/lib/brief/store";

describe("PATCH /api/briefs/[conversationId] — conversation deleted meanwhile", () => {
  it("answers 404 and writes nothing", async () => {
    const conversationId = uuid();
    const brief = { ...emptyBrief(), step: 4 };
    getDb()
      .prepare("INSERT INTO thumbnail_briefs (conversation_id, project_id, data, updated_at) VALUES (?, 'proj-race', ?, '2026-09-17T10:00:00.000Z')")
      .run(conversationId, JSON.stringify(brief));
    const res = await PATCH(
      new Request(`http://localhost/api/briefs/${conversationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ video: { promise: "Trop tard" } }),
      }) as never,
      { params: Promise.resolve({ conversationId }) },
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Conversation introuvable" });
    expect(getBrief(conversationId)!.brief.video.promise).toBeUndefined();
  });
});
