import { describe, it, expect } from "vitest";
import { v4 as uuid } from "uuid";
import { GET, PATCH } from "@/app/api/briefs/[conversationId]/route";
import { createConversation, softDeleteConversation } from "@/lib/agent/conversation/store";
import { briefUpdateInputSchema } from "@/lib/brief/merge";
import { getBrief, updateBrief } from "@/lib/brief/store";
import { pkg } from "./fixtures";

const url = (id: string) => `http://localhost/api/briefs/${id}`;
const ctx = (conversationId: string) => ({ params: Promise.resolve({ conversationId }) });

function patch(conversationId: string, body: unknown, contentType: string | null = "application/json") {
  const headers: Record<string, string> = {};
  if (contentType) headers["Content-Type"] = contentType;
  return PATCH(new Request(url(conversationId), { method: "PATCH", headers, body: typeof body === "string" ? body : JSON.stringify(body) }) as never, ctx(conversationId));
}

function withBrief() {
  const conversation = createConversation("proj-brief-routes");
  updateBrief(conversation.id, conversation.project_id, briefUpdateInputSchema.parse({ step: 6, variant: { key: "A", set: pkg() } }));
  return conversation.id;
}

describe("GET /api/briefs/[conversationId]", () => {
  it("answers 404 for an unknown or deleted conversation", async () => {
    expect((await GET(new Request(url("nope")) as never, ctx(uuid()))).status).toBe(404);
    const conversation = createConversation("proj-brief-routes");
    softDeleteConversation(conversation.id);
    const res = await GET(new Request(url(conversation.id)) as never, ctx(conversation.id));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Conversation introuvable" });
  });

  it("answers null without a brief, and the brief when there is one", async () => {
    const empty = createConversation("proj-brief-routes");
    expect(await (await GET(new Request(url(empty.id)) as never, ctx(empty.id))).json()).toEqual({ brief: null, updatedAt: null });
    const id = withBrief();
    const body = await (await GET(new Request(url(id)) as never, ctx(id))).json();
    expect(body.brief).toMatchObject({ step: 6, variants: [{ key: "A", title: pkg().title }] });
    expect(body.updatedAt).toBe(getBrief(id)!.updatedAt);
  });
});

describe("PATCH /api/briefs/[conversationId]", () => {
  it("accepts JSON only", async () => {
    const id = withBrief();
    const res = await patch(id, { video: { promise: "x" } }, null);
    expect(res.status).toBe(415);
    expect(getBrief(id)!.brief.video.promise).toBeUndefined();
  });

  it("answers 404 without a conversation or without a brief", async () => {
    expect((await patch(uuid(), { video: { promise: "x" } })).status).toBe(404);
    const empty = createConversation("proj-brief-routes");
    const res = await patch(empty.id, { video: { promise: "x" } });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Fiche introuvable" });
  });

  it("refuses a broken body and the fields only the agent or the server write", async () => {
    const id = withBrief();
    expect((await patch(id, "{not json")).status).toBe(400);
    for (const body of [{ step: 7 }, { research: { summary: "x" } }, { usage: { sketches: 0 } }, { logoCandidates: [] }]) {
      const res = await patch(id, body);
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe(`Champ non modifiable : ${Object.keys(body)[0]}`);
    }
    expect(getBrief(id)!.brief.step).toBe(6);
  });

  it("validates with the brief rules and names the field", async () => {
    const id = withBrief();
    const res = await patch(id, { variant: { key: "A", set: { thumbnailText: "a b c d e" } } });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Fiche invalide",
      issues: [{ path: "variants.A.thumbnailText", message: "Texte de miniature : 4 mots maximum" }],
    });
    expect(getBrief(id)!.brief.variants[0].thumbnailText).toBe("10 MIN");
  });

  it("saves an edit with the same merge", async () => {
    const id = withBrief();
    const res = await patch(id, { video: { promise: "Savoir créer une miniature" }, common: { textMode: "overlay" } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.brief).toMatchObject({ step: 6, video: { promise: "Savoir créer une miniature" }, common: { textMode: "overlay" } });
    expect(body.warnings).toEqual([]);
    expect(getBrief(id)!.brief.video.promise).toBe("Savoir créer une miniature");
  });
});
