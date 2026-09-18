import { NextResponse } from "next/server";
import { getConversation } from "@/lib/agent/conversation/store";
import { getBrief } from "@/lib/brief/store";
import { simpleIconSvg } from "@/lib/logos/providers/simple-icons";
import { isSvglAssetUrl } from "@/lib/logos/providers/svgl";
import { isCommonsFileUrl } from "@/lib/logos/providers/wikimedia";

export const runtime = "nodejs";

type Context = { params: Promise<{ conversationId: string; id: string }> };

/** Preview of a logo candidate for ask_user. Never proxies Brandfetch. */
export async function GET(_req: Request, { params }: Context) {
  const { conversationId, id } = await params;
  if (!getConversation(conversationId)) return NextResponse.json({ error: "Conversation introuvable" }, { status: 404 });
  const stored = getBrief(conversationId);
  const candidate = stored?.brief.logoCandidates.find((entry) => entry.id === id);
  if (!candidate) return NextResponse.json({ error: "Candidat introuvable" }, { status: 404 });

  if (candidate.source === "simple-icons") {
    const svg = simpleIconSvg(candidate.ref);
    if (!svg) return NextResponse.json({ error: "Logo Simple Icons introuvable" }, { status: 404 });
    return new NextResponse(svg, { status: 200, headers: { "Content-Type": "image/svg+xml; charset=utf-8" } });
  }
  if (candidate.source === "svgl") {
    if (!isSvglAssetUrl(candidate.ref)) return NextResponse.json({ error: "Adresse SVGL refusée" }, { status: 400 });
    return NextResponse.redirect(candidate.ref, 302);
  }
  if (candidate.source === "wikimedia") {
    if (!isCommonsFileUrl(candidate.ref)) return NextResponse.json({ error: "Adresse Wikimedia refusée" }, { status: 400 });
    return NextResponse.redirect(candidate.ref, 302);
  }
  return NextResponse.json({ error: "Candidat introuvable" }, { status: 404 });
}
