import { NextResponse } from "next/server";
import { stopRun } from "@/lib/agent/v2/run-registry";
import { rejectNonJsonRequest } from "@/lib/youtube/route-errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** « Arrêter »: aborts the turn on the server; its stream then ends by itself, after the save. */
export async function POST(req: Request, { params }: { params: Promise<{ conversationId: string }> }) {
  const notJson = rejectNonJsonRequest(req);
  if (notJson) return notJson;
  const { conversationId } = await params;
  return NextResponse.json({ stopped: stopRun(conversationId) });
}
