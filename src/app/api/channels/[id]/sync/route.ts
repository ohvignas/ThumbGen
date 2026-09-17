import { NextResponse } from "next/server";
import { getTypedSettings } from "@/lib/settings";
import * as store from "@/lib/youtube/channel-store";
import { startChannelSync } from "@/lib/youtube/jobs";
import { missingYouTubeKeyResponse, rejectNonJsonRequest } from "@/lib/youtube/route-errors";

export const runtime = "nodejs";

/** « Actualiser » / « Réessayer ». */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const notJson = rejectNonJsonRequest(request);
  if (notJson) return notJson;
  const { id } = await params;
  if (!getTypedSettings().youtubeApiKey) return missingYouTubeKeyResponse();
  if (!store.channelExists(id)) return NextResponse.json({ error: "Chaîne inconnue" }, { status: 404 });
  if (!startChannelSync(id)) return NextResponse.json({ error: "Synchronisation déjà en cours" }, { status: 409 });
  return NextResponse.json({ started: true, channel: store.getChannelListItem(id) }, { status: 202 });
}
