import { getSetting } from "@/lib/settings";
import { THUMBGEN_USER_AGENT } from "@/lib/user-agent";

export const TYPESAFE_SYSTEMONE_URL = "https://api.typesafe.ai/v1/systemone";
export const TYPESAFE_MODELS_URL = "https://api.typesafe.ai/v1/models";
export const TYPESAFE_MODEL = "jev-latest";

export function typesafeApiKey(): string | undefined {
  return getSetting("typesafeApiKey");
}

type NoulAnswer = { type?: string; noul?: unknown };

export type NoulQuestion = {
  type: "noul";
  instructions: string;
  criteria?: { true: string; false: string };
};

export type ChoiceQuestion = { type: "choice"; instructions: string; criteria: Record<string, string | null> };
export type ScoreQuestion = { type: "score"; instructions: string; criteria: readonly string[] };
export type SystemOneQuestion = NoulQuestion | ChoiceQuestion | ScoreQuestion;
export type SystemOneAnswer =
  | { type: "noul"; noul: number }
  | { type: "choice"; choice: string; confidence?: number }
  | { type: "score"; score: number; confidence?: number };

export async function evaluateSystemOne(
  apiKey: string,
  state: unknown,
  questions: Record<string, SystemOneQuestion>,
  signal?: AbortSignal,
): Promise<Record<string, SystemOneAnswer>> {
  const res = await fetch(TYPESAFE_SYSTEMONE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "User-Agent": THUMBGEN_USER_AGENT,
    },
    body: JSON.stringify({ state, model: TYPESAFE_MODEL, questions }),
    signal,
  });
  if (!res.ok) throw new Error(`TypeSafe HTTP ${res.status}`);
  const body = (await res.json()) as { answers?: Record<string, Record<string, unknown>> };
  const answers: Record<string, SystemOneAnswer> = {};
  for (const [id, answer] of Object.entries(body.answers ?? {})) {
    if (answer.type === "noul" && typeof answer.noul === "number" && Number.isFinite(answer.noul)) {
      answers[id] = { type: "noul", noul: answer.noul };
    } else if (answer.type === "choice" && typeof answer.choice === "string") {
      answers[id] = {
        type: "choice",
        choice: answer.choice,
        confidence: typeof answer.confidence === "number" ? answer.confidence : undefined,
      };
    } else if (answer.type === "score" && typeof answer.score === "number" && Number.isFinite(answer.score)) {
      answers[id] = {
        type: "score",
        score: answer.score,
        confidence: typeof answer.confidence === "number" ? answer.confidence : undefined,
      };
    }
  }
  return answers;
}

export async function evaluateNouls(
  apiKey: string,
  state: unknown,
  questions: Record<string, NoulQuestion>,
  signal?: AbortSignal,
): Promise<Record<string, number>> {
  const res = await fetch(TYPESAFE_SYSTEMONE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "User-Agent": THUMBGEN_USER_AGENT,
    },
    body: JSON.stringify({ state, model: TYPESAFE_MODEL, questions }),
    signal,
  });
  if (!res.ok) {
    throw new Error(`TypeSafe HTTP ${res.status}`);
  }
  const body = (await res.json()) as { answers?: Record<string, NoulAnswer> };
  const nouls: Record<string, number> = {};
  for (const [id, answer] of Object.entries(body.answers ?? {})) {
    if (typeof answer.noul === "number" && Number.isFinite(answer.noul)) nouls[id] = answer.noul;
  }
  return nouls;
}
