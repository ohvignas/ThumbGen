import { createUIMessageStreamResponse } from "ai";
import { getRun, subscribe } from "@/lib/agent/v2/run-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Reconnection to a running turn — the default URL of AI SDK's reconnectToStream
 * (`${api}/${id}/stream`, GET). 204 when nothing runs: useChat does not resume.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ conversationId: string }> }) {
  const { conversationId } = await params;
  const run = getRun(conversationId);
  if (!run || run.status !== "running") return new Response(null, { status: 204 });
  return createUIMessageStreamResponse({ stream: subscribe(run) });
}
