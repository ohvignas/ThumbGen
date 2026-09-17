import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import { hasToolCall, isStepCount, streamText, tool, type UIMessageChunk } from "ai";
import { z } from "zod";
import { setSetting } from "@/lib/settings";
import { createFakeAgentModel, isFakeAgentEnabled } from "@/lib/agent/v2/fake-agent-model";
import { resolveAgentLanguageModel } from "@/lib/agent/v2/agent-model";
import { pumpRunStream, resetRunRegistry, runStatusForOutcome, startRun, stopRun } from "@/lib/agent/v2/run-registry";
import type { EndedRunStatus } from "@/lib/agent/v2/run-types";

// Local stand-ins for the two registry tools the fake script calls: no DB, no network.
const fakeTools = () => ({
  get_canvas_state: tool({
    inputSchema: z.object({ project_id: z.string() }),
    execute: async ({ project_id }) => `canvas ${project_id}`,
  }),
  finish_turn: tool({
    inputSchema: z.looseObject({ summary: z.string() }),
    execute: async () => ({ ok: true }),
  }),
});

const SYSTEM = "<project_id>proj_fake</project_id>";

let previousKeyEnv: string | undefined;
beforeEach(() => {
  resetRunRegistry();
  previousKeyEnv = process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  setSetting("openrouterApiKey", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
  if (previousKeyEnv !== undefined) process.env.OPENROUTER_API_KEY = previousKeyEnv;
  resetRunRegistry();
});

describe("isFakeAgentEnabled", () => {
  it("needs THUMBGEN_FAKE_AGENT outside production", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("THUMBGEN_FAKE_AGENT", "");
    expect(isFakeAgentEnabled()).toBe(false);
    vi.stubEnv("THUMBGEN_FAKE_AGENT", "1");
    expect(isFakeAgentEnabled()).toBe(true);
  });

  it("is impossible in production, whatever the environment says", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("THUMBGEN_FAKE_AGENT", "1");
    expect(isFakeAgentEnabled()).toBe(false);
  });

  it("is never configured in the Docker image", () => {
    for (const file of ["Dockerfile", "docker-compose.yml"]) {
      expect(fs.readFileSync(path.join(process.cwd(), file), "utf8")).not.toContain("THUMBGEN_FAKE_AGENT");
    }
    expect(fs.readFileSync(path.join(process.cwd(), "Dockerfile"), "utf8")).toContain("ENV NODE_ENV=production");
  });
});

describe("resolveAgentLanguageModel", () => {
  it("returns the fake model without any key when enabled", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("THUMBGEN_FAKE_AGENT", "1");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const resolved = resolveAgentLanguageModel("anthropic/claude-sonnet-4.6");
    warn.mockRestore();
    expect(resolved?.fake).toBe(true);
  });

  it("returns null without a key in production even with THUMBGEN_FAKE_AGENT, and the real provider with a key", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("THUMBGEN_FAKE_AGENT", "1");
    expect(resolveAgentLanguageModel("anthropic/claude-sonnet-4.6")).toBeNull();
    setSetting("openrouterApiKey", "test-key");
    expect(resolveAgentLanguageModel("anthropic/claude-sonnet-4.6")?.fake).toBe(false);
  });
});

describe("fake agent model", () => {
  it("plays a two-step turn — reasoning + get_canvas_state, then text + finish_turn — with no network", async () => {
    const model = createFakeAgentModel({ chunkDelayMs: 0 });
    const result = streamText({
      model,
      system: SYSTEM,
      messages: [{ role: "user", content: "Salut" }],
      tools: fakeTools(),
      stopWhen: [isStepCount(5), hasToolCall("finish_turn")],
    });
    const chunks: UIMessageChunk[] = [];
    for await (const chunk of result.toUIMessageStream()) chunks.push(chunk);
    const calls = chunks.flatMap((c) => (c.type === "tool-input-available" ? [c] : []));
    expect(calls.map((c) => c.toolName)).toEqual(["get_canvas_state", "finish_turn"]);
    expect(calls[0].input).toEqual({ project_id: "proj_fake" });
    expect(chunks.some((c) => c.type === "reasoning-delta")).toBe(true);
    expect(chunks.some((c) => c.type === "text-delta")).toBe(true);
    expect(model.doStreamCalls).toHaveLength(2);
    expect(chunks.at(-1)?.type).toBe("finish");
  });

  it("saves the turn (onEnd) while the run is still running, then ends it as done", async () => {
    const run = startRun("conv-order", "proj_fake")!;
    const statusAtSave: string[] = [];
    const result = streamText({
      model: createFakeAgentModel({ chunkDelayMs: 0 }),
      system: SYSTEM,
      messages: [{ role: "user", content: "Salut" }],
      tools: fakeTools(),
      stopWhen: [isStepCount(5), hasToolCall("finish_turn")],
      abortSignal: run.abort.signal,
      onEnd: () => {
        statusAtSave.push(run.status);
      },
    });
    let endStatus: EndedRunStatus = "done";
    await pumpRunStream(
      run,
      result.toUIMessageStream({ onEnd: ({ outcome }) => { endStatus = runStatusForOutcome(outcome.status); } }),
      () => endStatus,
    );
    expect(statusAtSave).toEqual(["running"]);
    expect(run.status).toBe("done");
  });

  it("stops on the run's abort: onAbort saves first, the stream ends with an abort chunk, the run is stopped", async () => {
    const run = startRun("conv-stop", "proj_fake")!;
    const statusAtAbort: string[] = [];
    const result = streamText({
      model: createFakeAgentModel({ chunkDelayMs: 20 }),
      system: SYSTEM,
      messages: [{ role: "user", content: "Salut" }],
      tools: fakeTools(),
      stopWhen: [isStepCount(5), hasToolCall("finish_turn")],
      abortSignal: run.abort.signal,
      onAbort: () => {
        statusAtAbort.push(run.status);
      },
    });
    let endStatus: EndedRunStatus = "done";
    const pumping = pumpRunStream(
      run,
      result.toUIMessageStream({ onEnd: ({ outcome }) => { endStatus = runStatusForOutcome(outcome.status); } }),
      () => endStatus,
    );
    await vi.waitFor(() => expect(run.chunks.some((c) => c.type === "reasoning-delta")).toBe(true));
    expect(stopRun("conv-stop")).toBe(true);
    await pumping;
    expect(statusAtAbort).toEqual(["running"]);
    expect(run.chunks.at(-1)?.type).toBe("abort");
    expect(run.status).toBe("stopped");
  });
});
