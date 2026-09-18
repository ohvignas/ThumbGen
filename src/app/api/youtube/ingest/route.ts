import { NextResponse } from "next/server";
import { canStartChannelIngest, readConnectionPublic } from "@/lib/youtube/connection";
import { startChannelIngest } from "@/lib/youtube/ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  if (!canStartChannelIngest()) {
    return NextResponse.json({ error: "Ajoute la clé YouTube Data API et l'URL de ta chaîne, ou connecte Google." }, { status: 401 });
  }
  startChannelIngest();
  return NextResponse.json(readConnectionPublic());
}
