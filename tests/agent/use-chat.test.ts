import { describe, it, expect } from "vitest";
import { parseSseStream } from "@/hooks/useChat";

function streamFromString(s: string): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(enc.encode(s));
      controller.close();
    },
  });
}

async function collect<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const x of gen) out.push(x);
  return out;
}

describe("parseSseStream", () => {
  it("parses a single text_delta event", async () => {
    const body = streamFromString(`event: text_delta\ndata: {"content":"hello"}\n\n`);
    const events = await collect(parseSseStream(body));
    expect(events).toEqual([{ type: "text_delta", content: "hello" }]);
  });

  it("parses multiple events back to back", async () => {
    const body = streamFromString(
      `event: text_delta\ndata: {"content":"hi"}\n\n` +
        `event: tool_call\ndata: {"id":"t1","name":"list_logos","input":{},"scope":"server"}\n\n` +
        `event: done\ndata: {"cost":0.01}\n\n`,
    );
    const events = await collect(parseSseStream(body));
    expect(events).toHaveLength(3);
    expect(events[0]).toEqual({ type: "text_delta", content: "hi" });
    expect(events[1]).toMatchObject({ type: "tool_call", name: "list_logos" });
    expect(events[2]).toMatchObject({ type: "done", cost: 0.01 });
  });

  it("handles events split across read chunks", async () => {
    // Manually push two chunks: header in one, payload in another
    const enc = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(enc.encode("event: text_delta\nda"));
        controller.enqueue(enc.encode('ta: {"content":"split"}\n\n'));
        controller.close();
      },
    });
    const events = await collect(parseSseStream(body));
    expect(events).toEqual([{ type: "text_delta", content: "split" }]);
  });

  it("skips malformed JSON without crashing", async () => {
    const body = streamFromString(
      `event: bad\ndata: not json\n\n` +
        `event: ok\ndata: {"x":1}\n\n`,
    );
    const events = await collect(parseSseStream(body));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "ok", x: 1 });
  });

  it("defaults event name to 'message' when absent", async () => {
    const body = streamFromString(`data: {"x":1}\n\n`);
    const events = await collect(parseSseStream(body));
    expect(events).toEqual([{ type: "message", x: 1 } as never]);
  });
});
