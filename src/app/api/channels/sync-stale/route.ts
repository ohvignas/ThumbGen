import { NextResponse } from "next/server";
import { z } from "zod";
import { getTypedSettings } from "@/lib/settings";
import { kickClassification, queueChannelSyncs } from "@/lib/youtube/jobs";
import { reconcileMyChannel } from "@/lib/youtube/my-channel";

export const runtime = "nodejs";

const Schema = z.object({ all: z.boolean().optional() });

/** Called once per app load (ChannelSyncTrigger), and with { all: true } by « Tout actualiser ». */
export async function POST(request: Request) {
  const parsed = Schema.safeParse(await request.json().catch(() => ({})));
  const all = parsed.success && parsed.data.all === true;
  if (getTypedSettings().youtubeApiKey) {
    try {
      await reconcileMyChannel();
    } catch (err) {
      console.error("[channels] « Ma chaîne »:", err);
    }
  }
  const result = queueChannelSyncs({ all });
  if (result.queued > 0) console.info(`[channels] ${result.queued} chaîne(s) en file de synchronisation`);
  kickClassification();
  return NextResponse.json(result, { status: 202 });
}
