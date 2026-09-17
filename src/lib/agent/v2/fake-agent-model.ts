import { MockLanguageModelV3 } from "ai/test";
import type { LanguageModelV3CallOptions, LanguageModelV3StreamPart } from "@ai-sdk/provider";
import { getDb } from "@/lib/db";
import { interviewScript, type FakeLibraryItem } from "./fake-interview-script";

/**
 * DEV ONLY (chantier F1): a scripted, slow agent turn with no network call, so
 * the background-run flow can be checked in a browser without paying a model.
 * Enabled by THUMBGEN_FAKE_AGENT on a dev server; impossible in production.
 */

/** Delay between two chunks of the script (≈ 22 s for the whole turn). */
export const FAKE_CHUNK_DELAY_MS = 1_000;

/** THUMBGEN_FAKE_AGENT=interview plays the guided interview (chantier F2); any other value the slow F1 turn. */
export const FAKE_INTERVIEW_SCENARIO = "interview";
export type FakeAgentScenario = "slow" | typeof FAKE_INTERVIEW_SCENARIO;
/** The interview's delay between chunks: quick enough to click through, slow enough to watch. */
export const FAKE_INTERVIEW_CHUNK_DELAY_MS = 150;

export function fakeAgentScenario(): FakeAgentScenario {
  return process.env.THUMBGEN_FAKE_AGENT === FAKE_INTERVIEW_SCENARIO ? FAKE_INTERVIEW_SCENARIO : "slow";
}

/** Library images offered by the fake references question (local DB, newest first). */
function libraryFromDb(): FakeLibraryItem[] {
  return getDb().prepare("SELECT id, title FROM swipe_files ORDER BY created_at DESC LIMIT 6").all() as FakeLibraryItem[];
}

export function isFakeAgentEnabled(): boolean {
  // Literal `process.env.NODE_ENV`: Next inlines it at build time, so a
  // production bundle compiles this to `return false` whatever the env says.
  if (process.env.NODE_ENV === "production") return false;
  return Boolean(process.env.THUMBGEN_FAKE_AGENT);
}

const USAGE = {
  inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 0, text: 0, reasoning: 0 },
};

function abortError(): Error {
  const error = new Error("Aborted");
  error.name = "AbortError";
  return error;
}

function sleep(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function projectIdOf(options: LanguageModelV3CallOptions): string {
  for (const message of options.prompt) {
    if (message.role !== "system") continue;
    const match = message.content.match(/<project_id>([^<]+)<\/project_id>/);
    if (match) return match[1];
  }
  return "";
}

function script(options: LanguageModelV3CallOptions): LanguageModelV3StreamPart[] {
  const stamp = Date.now().toString(36);
  const finish: LanguageModelV3StreamPart = { type: "finish", usage: USAGE, finishReason: { unified: "tool-calls", raw: "tool-calls" } };
  // Second step: the previous step's tool result is the last prompt message.
  if (options.prompt.at(-1)?.role === "tool") {
    const id = `fake-text-${stamp}`;
    return [
      { type: "stream-start", warnings: [] },
      { type: "text-start", id },
      ...["Tour ", "simulé : ", "aucun ", "modèle ", "n'a ", "été ", "appelé."].map((delta) => ({ type: "text-delta" as const, id, delta })),
      { type: "text-end", id },
      {
        type: "tool-call",
        toolCallId: `fake-finish-${stamp}`,
        toolName: "finish_turn",
        input: JSON.stringify({ summary: "Tour simulé terminé, sans appel de modèle.", results: [], next_actions: [] }),
      },
      finish,
    ];
  }
  const id = `fake-reasoning-${stamp}`;
  return [
    { type: "stream-start", warnings: [] },
    { type: "reasoning-start", id },
    ...["Je ", "regarde ", "le ", "canvas ", "avant ", "de ", "répondre."].map((delta) => ({ type: "reasoning-delta" as const, id, delta })),
    { type: "reasoning-end", id },
    {
      type: "tool-call",
      toolCallId: `fake-canvas-${stamp}`,
      toolName: "get_canvas_state",
      input: JSON.stringify({ project_id: projectIdOf(options) }),
    },
    finish,
  ];
}

export function createFakeAgentModel({
  chunkDelayMs,
  scenario = "slow",
  library = libraryFromDb,
}: { chunkDelayMs?: number; scenario?: FakeAgentScenario; library?: () => FakeLibraryItem[] } = {}) {
  const delay = chunkDelayMs ?? (scenario === FAKE_INTERVIEW_SCENARIO ? FAKE_INTERVIEW_CHUNK_DELAY_MS : FAKE_CHUNK_DELAY_MS);
  return new MockLanguageModelV3({
    provider: "thumbgen-fake",
    modelId: scenario === FAKE_INTERVIEW_SCENARIO ? "fake-agent-interview" : "fake-agent",
    doStream: async (options) => {
      const parts = scenario === FAKE_INTERVIEW_SCENARIO ? interviewScript(options, library()) : script(options);
      let index = 0;
      return {
        stream: new ReadableStream<LanguageModelV3StreamPart>({
          async pull(controller) {
            if (index >= parts.length) {
              controller.close();
              return;
            }
            // Rejects with an AbortError on stop: streamText then emits its `abort` chunk.
            if (index > 0) await sleep(delay, options.abortSignal);
            controller.enqueue(parts[index++]);
          },
        }),
      };
    },
  });
}
