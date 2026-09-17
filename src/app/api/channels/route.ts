import { NextResponse } from "next/server";
import { z } from "zod";
import { getTypedSettings } from "@/lib/settings";
import { fetchChannelDetails } from "@/lib/youtube/api";
import * as store from "@/lib/youtube/channel-store";
import { getClassificationStatus, reconcileSyncStatuses, startChannelSync } from "@/lib/youtube/jobs";
import { reconcileMyChannel } from "@/lib/youtube/my-channel";
import { missingYouTubeKeyResponse, rejectNonJsonRequest, youtubeErrorResponse } from "@/lib/youtube/route-errors";
import type { ChannelDetails, ChannelsResponse } from "@/lib/youtube/types";

export const runtime = "nodejs";

const FollowSchema = z.object({ youtubeChannelId: z.string().regex(/^UC[\w-]{20,}$/) });

export async function GET() {
  const youtubeConfigured = Boolean(getTypedSettings().youtubeApiKey);
  if (youtubeConfigured) {
    try {
      await reconcileMyChannel();
    } catch (err) {
      console.error("[channels] « Ma chaîne »:", err);
    }
  }
  reconcileSyncStatuses();
  const body: ChannelsResponse = {
    youtubeConfigured,
    channels: store.listChannelItems(),
    classification: getClassificationStatus(),
  };
  return NextResponse.json(body);
}

export async function POST(request: Request) {
  const notJson = rejectNonJsonRequest(request);
  if (notJson) return notJson;
  const apiKey = getTypedSettings().youtubeApiKey;
  if (!apiKey) return missingYouTubeKeyResponse();
  const parsed = FollowSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Identifiant de chaîne invalide" }, { status: 400 });

  const existing = store.getChannelByYoutubeId(parsed.data.youtubeChannelId);
  if (existing) return NextResponse.json({ channel: store.getChannelListItem(existing.id), alreadyFollowed: true });

  let details: ChannelDetails | null;
  try {
    details = await fetchChannelDetails(apiKey, parsed.data.youtubeChannelId);
  } catch (err) {
    return youtubeErrorResponse(err);
  }
  if (!details) return NextResponse.json({ error: "Chaîne introuvable" }, { status: 404 });

  const { channel, inserted } = store.insertChannel(details, { syncStatus: "syncing" });
  if (inserted) startChannelSync(channel.id);
  return NextResponse.json(
    { channel: store.getChannelListItem(channel.id), alreadyFollowed: !inserted },
    { status: inserted ? 201 : 200 },
  );
}
