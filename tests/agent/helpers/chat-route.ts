import { vi } from "vitest";
import type { UIMessageChunk } from "ai";
import { listRuns } from "@/lib/agent/v2/run-registry";

/** POST /api/agent/chat as the browser sends it (JSON). contentType: null sends a text/plain body. */
export function chatRequest(body: unknown, init: { signal?: AbortSignal; contentType?: string | null } = {}) {
  const headers: Record<string, string> = {};
  if (init.contentType !== null) headers["Content-Type"] = init.contentType ?? "application/json";
  return new Request("http://localhost/api/agent/chat", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: init.signal,
  }) as never;
}

type Outcome = { status: "completed" | "failed" | "aborted" };
type UIStreamOptions = {
  onError?: (error: unknown) => string;
  onEnd?: (event: { outcome: Outcome }) => void | Promise<void>;
};

/**
 * What postV2 uses of a streamText() result: toUIMessageStream(). The test
 * drives the stream (push / end / fail); end() calls the route's onEnd first,
 * like the real SDK does before closing the stream.
 */
export function fakeStreamResult({ autoEnd = false }: { autoEnd?: boolean } = {}) {
  let controller: ReadableStreamDefaultController<UIMessageChunk> | null = null;
  const fake = {
    options: {} as UIStreamOptions,
    cancelled: false,
    toUIMessageStream(options?: UIStreamOptions) {
      fake.options = options ?? {};
      return new ReadableStream<UIMessageChunk>({
        start(c) {
          controller = c;
          c.enqueue({ type: "start" });
          if (autoEnd) queueMicrotask(() => void fake.end());
        },
        cancel() {
          fake.cancelled = true;
        },
      });
    },
    push(chunk: UIMessageChunk) {
      controller?.enqueue(chunk);
    },
    async end(outcome: Outcome = { status: "completed" }) {
      await fake.options.onEnd?.({ outcome });
      controller?.close();
    },
    fail(error: Error) {
      controller?.error(error);
    },
  };
  return fake;
}

/** Waits until the conversation has no running run (the route pumps the stream asynchronously). */
export async function waitForRunEnd(conversationId: string): Promise<void> {
  await vi.waitFor(() => {
    if (listRuns().some((run) => run.conversationId === conversationId && run.status === "running")) {
      throw new Error(`run ${conversationId} still running`);
    }
  });
}
