import { NextResponse } from "next/server";
import { getTypedSettings } from "@/lib/settings";
import * as store from "@/lib/youtube/channel-store";
import { startChannelSync } from "@/lib/youtube/jobs";
import { missingYouTubeKeyResponse } from "@/lib/youtube/route-errors";

export const runtime = "nodejs";

/** « Actualiser » / « Réessayer ». */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!getTypedSettings().youtubeApiKey) return missingYouTubeKeyResponse();
  if (!store.channelExists(id)) return NextResponse.json({ error: "Chaîne inconnue" }, { status: 404 });
  if (!startChannelSync(id)) return NextResponse.json({ error: "Synchronisation déjà en cours" }, { status: 409 });
  return NextResponse.json({ started: true, channel: store.getChannelListItem(id) }, { status: 202 });
}
