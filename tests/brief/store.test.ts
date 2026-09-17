import { describe, it, expect, vi } from "vitest";
import { v4 as uuid } from "uuid";
import { getDb } from "@/lib/db";
import { AGENT_TABLES_DDL } from "@/lib/agent/migrations";
import { createConversation, softDeleteConversation } from "@/lib/agent/conversation/store";
import { deleteProject } from "@/lib/local-storage";
import { briefUpdateInputSchema } from "@/lib/brief/merge";
import { getBrief, releaseBriefUsage, reserveBriefUsage, updateBrief } from "@/lib/brief/store";
import { pkg } from "./fixtures";

const input = (value: unknown) => briefUpdateInputSchema.parse(value);
const newConversation = (projectId = "proj-store") => createConversation(projectId).id;

function insertSketch(): string {
  const id = `sk_${uuid().replace(/-/g, "")}`;
  getDb()
    .prepare("INSERT INTO generated_sketches (id, prompt, mime_type, data, attached) VALUES (?, 'p', 'image/png', ?, 0)")
    .run(id, Buffer.from("png"));
  return id;
}
const attached = (id: string) =>
  (getDb().prepare("SELECT attached FROM generated_sketches WHERE id = ?").get(id) as { attached: number }).attached;
const sketch = (id: string) => ({ source: `generated:${id}`, status: "pending", autoFixed: false });

describe("brief store", () => {
  it("creates the table idempotently", () => {
    expect(() => {
      getDb().exec(AGENT_TABLES_DDL);
      getDb().exec(AGENT_TABLES_DDL);
    }).not.toThrow();
    expect(getDb().prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'thumbnail_briefs'").get()).toBeTruthy();
  });

  it("creates the brief on the first update, then merges into it", () => {
    const conversationId = newConversation();
    expect(getBrief(conversationId)).toBeNull();
    const first = updateBrief(conversationId, "proj-store", input({ step: 4, video: { promise: "Savoir cliquer" } }));
    expect(first.ok).toBe(true);
    const second = updateBrief(conversationId, "proj-other", input({ video: { audience: "Débutants" } }));
    if (!second.ok) throw new Error("second update refused");
    expect(second.stored).toMatchObject({
      conversationId,
      projectId: "proj-store",
      brief: { step: 4, video: { promise: "Savoir cliquer", audience: "Débutants" } },
    });
    expect(second.stored.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(getBrief(conversationId)?.brief.video).toEqual({ promise: "Savoir cliquer", audience: "Débutants" });
  });

  it("writes nothing when the update is refused", () => {
    const conversationId = newConversation();
    const ok = updateBrief(conversationId, "proj-store", input({ variant: { key: "A", set: pkg() } }));
    if (!ok.ok) throw new Error("setup refused");
    const refused = updateBrief(conversationId, "proj-store", input({ step: 5, variant: { key: "A", set: { thumbnailText: "a b c d e" } } }));
    expect(refused).toEqual({ ok: false, issues: [{ path: "variants.A.thumbnailText", message: "Texte de miniature : 4 mots maximum" }] });
    const stored = getBrief(conversationId)!;
    expect(stored.brief.step).toBe(1);
    expect(stored.brief.variants[0].thumbnailText).toBe("10 MIN");
    expect(stored.updatedAt).toBe(ok.stored.updatedAt);
  });

  it("deletes the brief with its conversation, and a project's briefs with the project", () => {
    const conversation = createConversation("proj-delete-conv");
    updateBrief(conversation.id, conversation.project_id, input({ step: 2 }));
    softDeleteConversation(conversation.id);
    expect(getBrief(conversation.id)).toBeNull();

    const kept = newConversation("proj-keep");
    const [a, b] = [newConversation("proj-delete"), newConversation("proj-delete")];
    updateBrief(a, "proj-delete", input({ step: 2 }));
    updateBrief(b, "proj-delete", input({ step: 3 }));
    updateBrief(kept, "proj-keep", input({ step: 3 }));
    deleteProject("proj-delete");
    expect(getBrief(a)).toBeNull();
    expect(getBrief(b)).toBeNull();
    expect(getBrief(kept)).not.toBeNull();
  });

  it("attaches the brief's sketches and detaches a replaced one no longer used anywhere", () => {
    const conversationId = newConversation();
    const [first, second, onCanvas] = [insertSketch(), insertSketch(), insertSketch()];
    updateBrief(conversationId, "proj-sketch", input({ variant: { key: "A", set: { ...pkg(), sketch: sketch(first) } } }));
    expect(attached(first)).toBe(1);

    updateBrief(conversationId, "proj-sketch", input({ variant: { key: "A", set: { sketch: sketch(second) } } }));
    expect(attached(second)).toBe(1);
    expect(attached(first)).toBe(0);

    getDb()
      .prepare("INSERT INTO projects (id, nodes, edges, updated_at) VALUES (?, ?, '[]', ?)")
      .run(`proj-${uuid()}`, JSON.stringify([{ id: "s", type: "sketch", data: { image_source: `generated:${onCanvas}` } }]), new Date().toISOString());
    updateBrief(conversationId, "proj-sketch", input({ variant: { key: "A", set: { sketch: sketch(onCanvas) } } }));
    updateBrief(conversationId, "proj-sketch", input({ variant: { key: "A", set: { sketch: null } } }));
    expect(attached(onCanvas)).toBe(1);
  });

  it("reserves and releases usage in the brief", () => {
    const conversationId = newConversation();
    expect(reserveBriefUsage(conversationId, "sketches", () => null)).toEqual({ status: "no-brief" });
    updateBrief(conversationId, "proj-usage", input({ step: 7 }));
    expect(reserveBriefUsage(conversationId, "sketches", () => "non")).toEqual({ status: "refused", reason: "non" });
    expect(getBrief(conversationId)!.brief.usage.sketches).toBe(0);
    const before = getBrief(conversationId)!.updatedAt;
    expect(reserveBriefUsage(conversationId, "sketches", (brief) => (brief.usage.sketches >= 2 ? "limite" : null))).toEqual({ status: "reserved" });
    expect(reserveBriefUsage(conversationId, "sketches", (brief) => (brief.usage.sketches >= 2 ? "limite" : null))).toEqual({ status: "reserved" });
    expect(reserveBriefUsage(conversationId, "sketches", (brief) => (brief.usage.sketches >= 2 ? "limite" : null))).toEqual({
      status: "refused",
      reason: "limite",
    });
    expect(getBrief(conversationId)!.brief.usage.sketches).toBe(2);
    expect(getBrief(conversationId)!.updatedAt).toBe(before);
    releaseBriefUsage(conversationId, "sketches");
    releaseBriefUsage(conversationId, "sketches");
    releaseBriefUsage(conversationId, "sketches");
    expect(getBrief(conversationId)!.brief.usage.sketches).toBe(0);
  });

  it("reads and updates an older or broken stored brief instead of blocking every update", () => {
    const conversationId = newConversation();
    const broken = { step: 5, usage: { sketches: 2 }, variants: [{ key: "A", ...pkg({ thumbnailText: "a b c d e f" }) }] };
    getDb()
      .prepare("INSERT INTO thumbnail_briefs (conversation_id, project_id, data, updated_at) VALUES (?, 'proj-repair', ?, ?)")
      .run(conversationId, JSON.stringify(broken), new Date().toISOString());
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const stored = getBrief(conversationId)!;
    expect(stored.brief.usage).toEqual({ research: 0, competitorSearches: 0, analyses: 0, sketches: 2 });
    expect(stored.brief.step).toBe(5);
    const updated = updateBrief(conversationId, "proj-repair", input({ step: 6 }));
    warn.mockRestore();
    expect(updated.ok).toBe(true);
    expect(getBrief(conversationId)!.brief.step).toBe(6);
  });

  it("refuses to write the brief of an unknown or deleted conversation, even when it is deleted meanwhile", () => {
    expect(updateBrief(uuid(), "proj-store", input({ step: 2 }))).toEqual({
      ok: false,
      notFound: true,
      issues: [{ path: "", message: "Conversation introuvable" }],
    });
    const conversation = createConversation("proj-store");
    // The route or the tool saw the conversation, then it was deleted before the write.
    softDeleteConversation(conversation.id);
    const late = updateBrief(conversation.id, conversation.project_id, input({ step: 2 }));
    expect(late).toMatchObject({ ok: false, notFound: true });
    expect(getBrief(conversation.id)).toBeNull();
  });
});
