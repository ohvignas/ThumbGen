"use client";
import { useState, useCallback, useRef } from "react";

export type ChatEvent =
  | { type: "text_delta"; content: string }
  | { type: "tool_call"; id: string; name: string; input: unknown; scope: "ui" | "server" }
  | { type: "tool_result"; id: string; name: string; summary: string }
  | { type: "ui_tool_request"; id: string; name: string; input: unknown }
  | { type: "ui_tool_response_ack"; id: string }
  | { type: "done"; usage?: { input: number; output: number }; cost?: number }
  | { type: "error"; message: string };

export type SendChatBody = {
  conversation_id: string;
  project_id: string;
  message: { text: string; attachments?: Array<{ type: "image"; source: string }> };
  canvas_snapshot: unknown;
};

export async function* parseSseStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<ChatEvent, void, unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf("\n\n")) >= 0) {
      const block = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const lines = block.split("\n");
      const eventName = lines.find((l) => l.startsWith("event: "))?.slice(7) ?? "message";
      const dataStr = lines.find((l) => l.startsWith("data: "))?.slice(6) ?? "{}";
      try {
        yield { type: eventName, ...JSON.parse(dataStr) } as ChatEvent;
      } catch {
        // skip malformed
      }
    }
  }
}

export function useChat() {
  const [streaming, setStreaming] = useState(false);
  const [events, setEvents] = useState<ChatEvent[]>([]);
  const ctlRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    setEvents([]);
  }, []);

  const send = useCallback(async (body: SendChatBody) => {
    setStreaming(true);
    setEvents([]);
    const ctl = new AbortController();
    ctlRef.current = ctl;
    try {
      const resp = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: ctl.signal,
      });
      if (!resp.ok || !resp.body) {
        setEvents((prev) => [...prev, { type: "error", message: `HTTP ${resp.status}` }]);
        return;
      }

      for await (const event of parseSseStream(resp.body)) {
        setEvents((prev) => [...prev, event]);
      }
    } catch (e) {
      if ((e as { name?: string }).name === "AbortError") return;
      setEvents((prev) => [...prev, { type: "error", message: (e as Error).message }]);
    } finally {
      setStreaming(false);
      ctlRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    ctlRef.current?.abort();
  }, []);

  const respondToUiTool = useCallback(async (toolUseId: string, result: unknown) => {
    await fetch("/api/agent/chat/tool-result", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tool_use_id: toolUseId, result }),
    });
  }, []);

  return { send, stop, respondToUiTool, streaming, events, reset };
}
