import { NextResponse } from "next/server";
import * as store from "@/lib/youtube/channel-store";

export const runtime = "nodejs";

/** « Ne plus suivre »: the channel and its videos go; library copies stay. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const channel = store.getChannel(id);
  if (!channel) return NextResponse.json({ error: "Chaîne inconnue" }, { status: 404 });
  if (channel.is_mine === 1) {
    return NextResponse.json({ error: "« Ma chaîne » se change dans Réglages → Ma chaîne" }, { status: 409 });
  }
  store.deleteChannel(id);
  return NextResponse.json({ success: true });
}
