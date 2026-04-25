import { NextRequest } from "next/server";
import { runAgentLoop } from "@/lib/agent/loop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sseFormat(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as
    | {
        conversation_id?: string;
        project_id?: string;
        message?: { text?: string; attachments?: Array<{ type: "image"; source: string }> };
        canvas_snapshot?: unknown;
      }
    | null;

  if (!body?.conversation_id || !body?.project_id) {
    return new Response("Missing conversation_id or project_id", { status: 400 });
  }

  const ac = new AbortController();
  if (req.signal) {
    req.signal.addEventListener("abort", () => ac.abort());
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(enc.encode(sseFormat(event, data)));
        } catch {
          // controller might be closed if aborted — ignore
        }
      };

      try {
        await runAgentLoop({
          conversation_id: body.conversation_id!,
          project_id: body.project_id!,
          message: {
            text: body.message?.text ?? "",
            attachments: body.message?.attachments,
          },
          canvas_snapshot: body.canvas_snapshot,
          abort: ac.signal,
          send,
        });
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
