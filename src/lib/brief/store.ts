import { getDb } from "@/lib/db";
import { markAttached, markDetached } from "@/lib/agent/tools/_helpers/image-source";
import { applyBriefUpdate, type BriefUpdateInput } from "./merge";
import { emptyBrief, repairBrief, thumbnailBriefSchema, type BriefIssue, type BriefUsage, type ThumbnailBrief } from "./schema";

/**
 * Thumbnail briefs in the database (chantier F3): one row per conversation.
 * Every write merges, validates and re-reads inside one transaction.
 */

export type StoredBrief = { conversationId: string; projectId: string; brief: ThumbnailBrief; updatedAt: string };
export type BriefWriteResult =
  | { ok: true; stored: StoredBrief; warnings: string[] }
  | { ok: false; issues: BriefIssue[]; notFound?: true };
export type UsageReservation = { status: "no-brief" } | { status: "refused"; reason: string } | { status: "reserved" };

type Row = { conversation_id: string; project_id: string; data: string; updated_at: string };

function readData(json: string): ThumbnailBrief {
  let raw: unknown = null;
  try {
    raw = JSON.parse(json);
  } catch {
    raw = null;
  }
  const parsed = thumbnailBriefSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  // Never block a conversation over a stored brief that breaks today's rules:
  // drop what breaks them (the next write stores the repaired brief).
  const { brief, dropped } = repairBrief(raw);
  console.warn("[brief] a stored brief did not validate, dropped:", dropped);
  return brief;
}

export function getBrief(conversationId: string): StoredBrief | null {
  const row = getDb()
    .prepare("SELECT conversation_id, project_id, data, updated_at FROM thumbnail_briefs WHERE conversation_id = ?")
    .get(conversationId) as Row | undefined;
  if (!row) return null;
  return { conversationId: row.conversation_id, projectId: row.project_id, brief: readData(row.data), updatedAt: row.updated_at };
}

const sketchSources = (brief: ThumbnailBrief) =>
  new Set(brief.variants.flatMap((variant) => (variant.sketch ? [variant.sketch.source] : [])));

/** A sketch id still mentioned by a brief or a canvas must stay attached. */
function stillReferenced(source: string): boolean {
  const like = `%${source.slice("generated:".length)}%`;
  const db = getDb();
  return (
    Boolean(db.prepare("SELECT 1 FROM thumbnail_briefs WHERE data LIKE ? LIMIT 1").get(like)) ||
    Boolean(db.prepare("SELECT 1 FROM projects WHERE nodes LIKE ? LIMIT 1").get(like))
  );
}

export function updateBrief(conversationId: string, projectId: string, input: BriefUpdateInput): BriefWriteResult {
  const db = getDb();
  return db.transaction((): BriefWriteResult => {
    // Checked inside the write: a conversation deleted after the caller looked never gets a brief back.
    const alive = db.prepare("SELECT 1 FROM conversations WHERE id = ? AND deleted_at IS NULL").get(conversationId);
    if (!alive) return { ok: false, notFound: true, issues: [{ path: "", message: "Conversation introuvable" }] };
    const existing = getBrief(conversationId);
    const current = existing?.brief ?? emptyBrief();
    const now = new Date().toISOString();
    const result = applyBriefUpdate(current, input, now);
    if (!result.ok) return result;
    db.prepare(
      `INSERT INTO thumbnail_briefs (conversation_id, project_id, data, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(conversation_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
    ).run(conversationId, existing?.projectId ?? projectId, JSON.stringify(result.brief), now);

    const before = sketchSources(current);
    const after = sketchSources(result.brief);
    for (const source of after) markAttached(source);
    for (const source of before) {
      if (!after.has(source) && !stillReferenced(source)) markDetached(source);
    }

    const stored = getBrief(conversationId);
    if (!stored) throw new Error("the brief was not written");
    return { ok: true, stored, warnings: result.warnings };
  })();
}

function writeUsage(conversationId: string, brief: ThumbnailBrief): void {
  // Server bookkeeping, not a decision: updated_at is left alone.
  getDb().prepare("UPDATE thumbnail_briefs SET data = ? WHERE conversation_id = ?").run(JSON.stringify(brief), conversationId);
}

/** Checks `refusal` and counts one more `key` use, atomically. */
export function reserveBriefUsage(
  conversationId: string,
  key: keyof BriefUsage,
  refusal: (brief: ThumbnailBrief) => string | null,
): UsageReservation {
  return getDb().transaction((): UsageReservation => {
    const existing = getBrief(conversationId);
    if (!existing) return { status: "no-brief" };
    const reason = refusal(existing.brief);
    if (reason) return { status: "refused", reason };
    const usage = { ...existing.brief.usage, [key]: existing.brief.usage[key] + 1 };
    writeUsage(conversationId, { ...existing.brief, usage });
    return { status: "reserved" };
  })();
}

/** Gives back a reservation whose call failed (never below 0). */
export function releaseBriefUsage(conversationId: string, key: keyof BriefUsage): void {
  getDb().transaction(() => {
    const existing = getBrief(conversationId);
    if (!existing) return;
    const usage = { ...existing.brief.usage, [key]: Math.max(0, existing.brief.usage[key] - 1) };
    writeUsage(conversationId, { ...existing.brief, usage });
  })();
}
