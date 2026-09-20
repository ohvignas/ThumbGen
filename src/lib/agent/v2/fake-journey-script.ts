import type { LanguageModelV3CallOptions, LanguageModelV3StreamPart } from "@ai-sdk/provider";

/**
 * DEV ONLY: a short free conversation for THUMBGEN_FAKE_AGENT=journey.
 * Not a 7-step wizard. Never generate_sketch (paid).
 */

export type FakePersona = { id: string; label: string };

const USAGE = {
  inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 0, text: 0, reasoning: 0 },
};

let counter = 0;

function step(sentence: string, toolName: string, input: unknown, key: string): LanguageModelV3StreamPart[] {
  const stamp = `${Date.now().toString(36)}${(counter++).toString(36)}`;
  const id = `fake-text-${stamp}`;
  return [
    { type: "stream-start", warnings: [] },
    { type: "text-start", id },
    ...sentence.split(/(?<= )/).map((delta) => ({ type: "text-delta" as const, id, delta })),
    { type: "text-end", id },
    { type: "tool-call", toolCallId: `fake-${key}-${stamp}`, toolName, input: JSON.stringify(input) },
    { type: "finish", usage: USAGE, finishReason: { unified: "tool-calls", raw: "tool-calls" } },
  ];
}

const finish = (summary: string, nextActions: unknown[] = []) =>
  step("Je résume.", "finish_turn", { summary, results: [], next_actions: nextActions }, "finish");

type ToolResultPart = { type: "tool-result"; toolCallId: string; toolName: string; output: unknown };
type Answer = { selected?: string[]; other?: string; skipped?: boolean };

const keyOf = (toolCallId: string) => toolCallId.match(/^fake-(.+)-[a-z0-9]+$/)?.[1] ?? "";

function toolResults(options: LanguageModelV3CallOptions): ToolResultPart[] {
  return options.prompt.flatMap((message) =>
    message.role === "tool" ? (message.content as Array<{ type: string }>).filter((part): part is ToolResultPart => part.type === "tool-result") : [],
  );
}

function answerOf(results: ToolResultPart[], key: string): Answer | null {
  const result = [...results].reverse().find((candidate) => keyOf(candidate.toolCallId) === key);
  const value = (result?.output as { value?: unknown } | undefined)?.value;
  return value && typeof value === "object" ? (value as Answer) : null;
}

export function journeyScript(options: LanguageModelV3CallOptions, _personas: FakePersona[]): LanguageModelV3StreamPart[] {
  const results = toolResults(options);
  const last = options.prompt.at(-1);

  if (last?.role !== "tool") {
    return step("Je charge la skill.", "read_skill", { name: "thumbnail-packaging" }, "skill");
  }

  const result = (last.content as Array<{ type: string }>).find((part): part is ToolResultPart => part.type === "tool-result");
  if (!result) return finish("Tour simulé interrompu.");
  if ((result.output as { type?: string } | null)?.type === "error-text") return finish("Cette étape n'a pas pu être enregistrée.");
  const key = keyOf(result.toolCallId);
  const answer = answerOf(results, key);
  if (answer?.skipped) return finish("Question passée : on s'arrête là.");

  switch (key) {
    case "skill":
      return step(
        "Question.",
        "ask_user",
        {
          question: "De quoi parle la vidéo, et qu'est-ce que le spectateur saura faire ou comprendre à la fin ?",
          options: [],
          allow_skip: false,
        },
        "ask-promise",
      );
    case "ask-promise":
      return finish("Sujet noté. On peut chercher des logos, des concurrents, ou poser déjà le canvas.");
    default:
      return finish("Tour simulé terminé.");
  }
}
