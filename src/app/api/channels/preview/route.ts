import { NextResponse } from "next/server";
import { z } from "zod";
import { getTypedSettings } from "@/lib/settings";
import { resolveChannelInput } from "@/lib/youtube/api";
import * as store from "@/lib/youtube/channel-store";
import { missingYouTubeKeyResponse, youtubeErrorResponse } from "@/lib/youtube/route-errors";
import type { ChannelPreview } from "@/lib/youtube/types";

export const runtime = "nodejs";

const PreviewSchema = z.object({ input: z.string().trim().min(1).max(300) });

export async function POST(request: Request) {
  const apiKey = getTypedSettings().youtubeApiKey;
  if (!apiKey) return missingYouTubeKeyResponse();
  const parsed = PreviewSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Colle l'URL, le @handle ou l'identifiant d'une chaîne" }, { status: 400 });
  }
  try {
    const resolved = await resolveChannelInput(apiKey, parsed.data.input);
    if (resolved.status === "not-found") return NextResponse.json({ error: "Chaîne introuvable" }, { status: 404 });
    const channel: ChannelPreview = {
      ...resolved.channel,
      alreadyFollowed: store.getChannelByYoutubeId(resolved.channel.youtubeChannelId) !== null,
    };
    return NextResponse.json({ channel });
  } catch (err) {
    return youtubeErrorResponse(err);
  }
}
