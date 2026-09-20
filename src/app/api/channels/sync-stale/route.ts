import { NextResponse } from "next/server";
import { z } from "zod";
import { getTypedSettings } from "@/lib/settings";
import { kickClassification, queueChannelSyncs, queueSnapshotPoll } from "@/lib/youtube/jobs";
import { startRssPollTimer } from "@/lib/youtube/rss-poll-timer";
import { reconcileMyChannel } from "@/lib/youtube/my-channel";
import { rejectNonJsonRequest } from "@/lib/youtube/route-errors";

export const runtime = "nodejs";

const Schema = z.object({ all: z.boolean().optional() });

/**
 * Page load (ChannelSyncTrigger) and « Tout actualiser » (`{ all: true }`).
 * Also starts the in-process 15 min RSS/snapshot timer if instrumentation
 * has not already (idempotent). The timer keeps running after this request.
 */
export async function POST(request: Request) {
  const notJson = rejectNonJsonRequest(request);
  if (notJson) return notJson;
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
  startRssPollTimer();
  queueSnapshotPoll();
  kickClassification();
  return NextResponse.json(result, { status: 202 });
}
