import { NextResponse } from "next/server";
import { listRuns } from "@/lib/agent/v2/run-registry";
import { buildRunsSnapshot } from "@/lib/agent/v2/runs-snapshot";
import { getConversation } from "@/lib/agent/conversation/store";
import { getProjectName } from "@/lib/local-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Turns running now and turns ended in the last 5 minutes, for the indicators and toasts. */
export async function GET() {
  const snapshot = buildRunsSnapshot(listRuns(), {
    conversationExists: (conversationId) => getConversation(conversationId) !== null,
    projectName: getProjectName,
  });
  return NextResponse.json(snapshot, { headers: { "Cache-Control": "no-store" } });
}
