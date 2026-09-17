import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { UIMessageChunk } from "ai";
import {
  RUN_CHUNK_SOFT_CAP,
  RUN_RETENTION_MS,
  appendChunk,
  discardRun,
  finishRun,
  getRun,
  hasPendingClientRequest,
  listRuns,
  pumpRunStream,
  resetRunRegistry,
  runStatusForOutcome,
  startRun,
  stopRun,
  subscribe,
} from "@/lib/agent/v2/run-registry";

async function readAll(stream: ReadableStream<UIMessageChunk>): Promise<UIMessageChunk[]> {
  const out: UIMessageChunk[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return out;
    out.push(value);
  }
}

const text = (delta: string, id = "t"): UIMessageChunk => ({ type: "text-delta", id, delta });

beforeEach(() => resetRunRegistry());
afterEach(() => {
  vi.useRealTimers();
  resetRunRegistry();
});

describe("run registry", () => {
  it("allows one running run per conversation", () => {
    const run = startRun("c1", "p1");
    expect(run?.status).toBe("running");
    expect(startRun("c1", "p1")).toBeNull();
    expect(startRun("c2", "p1")).not.toBeNull();
  });

  it("replaces a finished run", () => {
    const first = startRun("c1", "p1")!;
    finishRun(first, "done");
    const second = startRun("c1", "p1");
    expect(second).not.toBeNull();
    expect(second).not.toBe(first);
    expect(getRun("c1")).toBe(second);
  });

  it("removes a finished run after 5 minutes, but never a newer run", () => {
    vi.useFakeTimers();
    const first = startRun("c1", "p1")!;
    finishRun(first, "done");
    vi.advanceTimersByTime(RUN_RETENTION_MS - 1);
    expect(getRun("c1")).toBe(first);
    vi.advanceTimersByTime(1);
    expect(getRun("c1")).toBeNull();

    const older = startRun("c2", "p1")!;
    finishRun(older, "done");
    const newer = startRun("c2", "p1")!;
    vi.advanceTimersByTime(RUN_RETENTION_MS * 2);
    expect(getRun("c2")).toBe(newer);
  });

  it("replays the whole buffer to a late subscriber, then the live chunks, and closes at the end", async () => {
    const run = startRun("c1", "p1")!;
    appendChunk(run, { type: "start" });
    appendChunk(run, text("Bon"));
    const reading = readAll(subscribe(run));
    appendChunk(run, text("jour"));
    finishRun(run, "done");
    expect(await reading).toEqual([{ type: "start" }, text("Bon"), text("jour")]);
    // A subscriber arriving after the end gets the buffer and an immediate close.
    expect(await readAll(subscribe(run))).toHaveLength(3);
  });

  it("cancelling a subscriber never touches the run", async () => {
    const run = startRun("c1", "p1")!;
    const reader = subscribe(run).getReader();
    await reader.cancel();
    expect(run.subscribers.size).toBe(0);
    expect(run.abort.signal.aborted).toBe(false);
    expect(run.status).toBe("running");
    appendChunk(run, text("encore"));
    expect(run.chunks).toHaveLength(1);
  });

  it("stopRun aborts a running run only", () => {
    const run = startRun("c1", "p1")!;
    expect(stopRun("c1")).toBe(true);
    expect(run.abort.signal.aborted).toBe(true);
    finishRun(run, "stopped");
    expect(stopRun("c1")).toBe(false);
    expect(stopRun("unknown")).toBe(false);
  });

  it("finishRun counts only once and ignores later chunks", () => {
    const run = startRun("c1", "p1")!;
    finishRun(run, "error");
    finishRun(run, "done");
    appendChunk(run, text("late"));
    expect(run.status).toBe("error");
    expect(run.endedAt).toBeTypeOf("number");
    expect(run.chunks).toHaveLength(0);
  });

  it("discardRun removes the entry at once and frees the lock", async () => {
    const run = startRun("c1", "p1")!;
    const reading = readAll(subscribe(run));
    discardRun(run);
    expect(await reading).toEqual([]);
    expect(getRun("c1")).toBeNull();
    expect(listRuns()).toEqual([]);
    expect(startRun("c1", "p1")).not.toBeNull();
  });

  it("merges consecutive deltas past the soft cap without dropping a structural chunk", () => {
    const run = startRun("c1", "p1")!;
    appendChunk(run, { type: "start" });
    for (let i = 1; i < RUN_CHUNK_SOFT_CAP; i++) appendChunk(run, text("a"));
    expect(run.chunks).toHaveLength(RUN_CHUNK_SOFT_CAP);
    for (let i = 0; i < 500; i++) appendChunk(run, text("b"));
    expect(run.chunks).toHaveLength(RUN_CHUNK_SOFT_CAP);
    appendChunk(run, { type: "tool-input-start", toolCallId: "x", toolName: "get_canvas_state" });
    appendChunk(run, { type: "tool-input-delta", toolCallId: "x", inputTextDelta: "{" });
    appendChunk(run, { type: "tool-input-delta", toolCallId: "x", inputTextDelta: "}" });
    appendChunk(run, { type: "tool-input-available", toolCallId: "x", toolName: "get_canvas_state", input: {} });
    appendChunk(run, { type: "finish" });
    expect(run.chunks).toHaveLength(RUN_CHUNK_SOFT_CAP + 4);
    const joined = run.chunks.map((c) => (c.type === "text-delta" ? c.delta : "")).join("");
    expect(joined).toBe("a".repeat(RUN_CHUNK_SOFT_CAP - 1) + "b".repeat(500));
    expect(run.chunks.find((c) => c.type === "tool-input-delta")).toEqual({ type: "tool-input-delta", toolCallId: "x", inputTextDelta: "{}" });
    expect(run.chunks.at(-1)).toEqual({ type: "finish" });
  });

  it("detects a pending client request", () => {
    const ask: UIMessageChunk = { type: "tool-input-available", toolCallId: "r1", toolName: "request_user_image", input: {} };
    expect(hasPendingClientRequest([ask])).toBe(true);
    expect(hasPendingClientRequest([ask, { type: "tool-output-available", toolCallId: "r1", output: {} }])).toBe(false);
    expect(hasPendingClientRequest([{ type: "tool-input-available", toolCallId: "s1", toolName: "list_logos", input: {} }])).toBe(false);
    const run = startRun("c1", "p1")!;
    appendChunk(run, ask);
    finishRun(run, "done");
    expect(listRuns()).toEqual([
      { conversationId: "c1", projectId: "p1", startedAt: run.startedAt, status: "done", endedAt: run.endedAt, pendingClientRequest: true },
    ]);
  });

  it("counts an unanswered guided-interview question (ask_user) as a pending client request", () => {
    const question: UIMessageChunk = { type: "tool-input-available", toolCallId: "q1", toolName: "ask_user", input: {} };
    expect(hasPendingClientRequest([question])).toBe(true);
    expect(hasPendingClientRequest([question, { type: "tool-output-available", toolCallId: "q1", output: { selected: ["a"] } }])).toBe(false);
    const patch = { type: "data-canvas-patch", id: "iv-prompt", transient: true, data: {} } as unknown as UIMessageChunk;
    expect(hasPendingClientRequest([patch, question])).toBe(true);
  });

  it("maps stream outcomes to run statuses", () => {
    expect(runStatusForOutcome("completed")).toBe("done");
    expect(runStatusForOutcome("aborted")).toBe("stopped");
    expect(runStatusForOutcome("failed")).toBe("error");
    expect(runStatusForOutcome("unknown")).toBe("done");
  });

  it("pumps a stream into the run and ends it with the reported status, or error on a read failure", async () => {
    const ok = startRun("c1", "p1")!;
    await pumpRunStream(
      ok,
      new ReadableStream<UIMessageChunk>({
        start(controller) {
          controller.enqueue({ type: "start" });
          controller.close();
        },
      }),
      () => "stopped",
    );
    expect(ok.chunks).toEqual([{ type: "start" }]);
    expect(ok.status).toBe("stopped");

    const broken = startRun("c2", "p1")!;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await pumpRunStream(
      broken,
      new ReadableStream<UIMessageChunk>({
        start(controller) {
          controller.error(new Error("provider down"));
        },
      }),
      () => "done",
    );
    errorSpy.mockRestore();
    expect(broken.status).toBe("error");
  });
});
