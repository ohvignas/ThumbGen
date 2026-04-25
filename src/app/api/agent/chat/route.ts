import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SseEvent = string;

function sseFormat(event: string, data: unknown): SseEvent {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as
    | {
        conversation_id?: string;
        project_id?: string;
        message?: { text?: string; attachments?: unknown[] };
        canvas_snapshot?: unknown;
      }
    | null;

  if (!body?.conversation_id || !body?.project_id) {
    return new Response("Missing conversation_id or project_id", { status: 400 });
  }

  const ac = new AbortController();
  // If the client closes the connection (e.g. user clicks Stop),
  // forward to the agent loop via the AbortController.
  if (req.signal) {
    req.signal.addEventListener("abort", () => ac.abort());
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (event: string, data: unknown) => {
        controller.enqueue(enc.encode(sseFormat(event, data)));
      };

      try {
        // The actual agent loop is wired up in Task 21. For now, this skeleton
        // just validates the SSE pipe end-to-end with a "ready" event.
        send("text_delta", { content: "[skeleton: agent loop not yet wired]" });
        send("done", { ok: true });
      } catch (e) {
        send("error", { message: (e as Error).message });
      } finally {
        controller.close();
      }
    },
    cancel() {
      ac.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
