import { NextRequest, NextResponse } from "next/server";
import { getConversation } from "@/lib/agent/conversation/store";
import { BRIEF_PATCH_KEYS, briefPatchInputSchema } from "@/lib/brief/merge";
import { briefIssues } from "@/lib/brief/schema";
import { getBrief, updateBrief } from "@/lib/brief/store";
import { rejectNonJsonRequest } from "@/lib/youtube/route-errors";

export const runtime = "nodejs";

type Context = { params: Promise<{ conversationId: string }> };

/** The conversation's thumbnail brief (« Fiche »), or null before the journey wrote one. */
export async function GET(_req: NextRequest, { params }: Context) {
  const { conversationId } = await params;
  if (!getConversation(conversationId)) return NextResponse.json({ error: "Conversation introuvable" }, { status: 404 });
  const stored = getBrief(conversationId);
  return NextResponse.json({ brief: stored?.brief ?? null, updatedAt: stored?.updatedAt ?? null });
}

/** An edit from the « Fiche » panel: the agent's merge and rules, without step nor research. */
export async function PATCH(req: NextRequest, { params }: Context) {
  const notJson = rejectNonJsonRequest(req);
  if (notJson) return notJson;
  const { conversationId } = await params;
  const conversation = getConversation(conversationId);
  if (!conversation) return NextResponse.json({ error: "Conversation introuvable" }, { status: 404 });
  if (!getBrief(conversationId)) return NextResponse.json({ error: "Fiche introuvable" }, { status: 404 });

  const body: unknown = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
  }
  const locked = Object.keys(body).filter((key) => !BRIEF_PATCH_KEYS.includes(key));
  if (locked.length > 0) return NextResponse.json({ error: `Champ non modifiable : ${locked.join(", ")}` }, { status: 400 });

  const parsed = briefPatchInputSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Fiche invalide", issues: briefIssues(parsed.error) }, { status: 400 });
  const result = updateBrief(conversationId, conversation.project_id, parsed.data);
  if (!result.ok && result.notFound) return NextResponse.json({ error: "Conversation introuvable" }, { status: 404 });
  if (!result.ok) return NextResponse.json({ error: "Fiche invalide", issues: result.issues }, { status: 400 });
  return NextResponse.json({ brief: result.stored.brief, updatedAt: result.stored.updatedAt, warnings: result.warnings });
}
