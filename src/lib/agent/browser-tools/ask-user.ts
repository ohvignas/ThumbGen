import { z } from "zod";

/**
 * `ask_user` (chantiers F2, F3): one clickable question of the thumbnail
 * journey. A client tool — no `execute`: the turn pauses until the chat card
 * answers `{ selected }`, `{ other }` or `{ skipped }`. With no option it is a
 * free question answered with `{ other }`. Pure — shared by the chat route's
 * tool declaration, the question card and the turn model.
 */
export const ASK_USER_TOOL_NAME = "ask_user";

/** The thumbnail journey's number of steps (« Étape n/7 »). */
export const ASK_USER_TOTAL_STEPS = 7;

export const ASK_USER_LIMITS = {
  question: 200,
  options: 12,
  label: 60,
  description: 140,
  maxSelected: 5,
  other: 300,
  optionId: 40,
} as const;

const optionSchema = z.object({
  id: z.string().trim().min(1).max(ASK_USER_LIMITS.optionId).describe("Stable id returned in `selected`."),
  label: z.string().trim().min(1).max(ASK_USER_LIMITS.label).describe("Short option text, max 60 characters."),
  description: z
    .string()
    .trim()
    .max(ASK_USER_LIMITS.description)
    .optional()
    .describe("One short line under the label, max 140 characters."),
  image: z
    .string()
    .optional()
    .describe(
      "Optional thumbnail: stored:persona_<id>, stored:sf_<id>, stored:lg_<id>, youtube:<videoId> or generated:sk_<id> (a sketch).",
    ),
});

export const askUserInputSchema = z
  .object({
    question: z.string().trim().min(1).max(ASK_USER_LIMITS.question).describe("The question, max 200 characters."),
    step: z
      .number()
      .int()
      .min(1)
      .max(ASK_USER_TOTAL_STEPS)
      .describe("The thumbnail journey step (1 to 7) this question belongs to; several questions may share a step."),
    multiple: z.boolean().default(false).describe("true lets the user pick several options, then « Valider »."),
    max_selected: z
      .number()
      .int()
      .min(1)
      .max(ASK_USER_LIMITS.maxSelected)
      .optional()
      .describe("Only with multiple: at most this many picks (1 to 5)."),
    options: z
      .array(optionSchema)
      .max(ASK_USER_LIMITS.options)
      .describe("0 to 12 options. No option = a free question: the user types the answer."),
    allow_skip: z.boolean().default(true).describe("Shows « Passer »."),
  })
  .superRefine((input, ctx) => {
    if (input.max_selected !== undefined && !input.multiple) {
      ctx.addIssue({ code: "custom", path: ["max_selected"], message: "max_selected requires multiple: true" });
    }
    if (input.multiple && input.options.length === 0) {
      ctx.addIssue({ code: "custom", path: ["multiple"], message: "multiple requires at least one option" });
    }
    const seen = new Set<string>();
    input.options.forEach((option, index) => {
      if (seen.has(option.id)) {
        ctx.addIssue({ code: "custom", path: ["options", index, "id"], message: `Duplicate option id: ${option.id}` });
      }
      seen.add(option.id);
    });
  });

export type AskUserInput = z.output<typeof askUserInputSchema>;
export type AskUserOption = AskUserInput["options"][number];

export type AskUserOutput = { selected: string[] } | { other: string } | { skipped: true; reason?: string };

export function parseAskUserInput(input: unknown): AskUserInput | null {
  const parsed = askUserInputSchema.safeParse(input);
  return parsed.success ? parsed.data : null;
}

/** The F2 guided interview's last question (« Question 8/8 »), still found in stored conversations. */
const F2_LAST_STEP = 8;

/**
 * For display only (folded history lines): also reads a question stored by the
 * F2 interview with step 8. The model's schema and the answer card keep 1 to 7.
 */
export function parseStoredAskUserInput(input: unknown): AskUserInput | null {
  const strict = parseAskUserInput(input);
  if (strict || !input || typeof input !== "object") return strict;
  if ((input as { step?: unknown }).step !== F2_LAST_STEP) return null;
  const parsed = parseAskUserInput({ ...input, step: ASK_USER_TOTAL_STEPS });
  return parsed ? { ...parsed, step: F2_LAST_STEP } : null;
}

/** How many options the card lets the user pick. */
export function askUserMaxSelected(input: AskUserInput): number {
  if (!input.multiple) return 1;
  return input.max_selected ?? Math.min(ASK_USER_LIMITS.maxSelected, input.options.length);
}

/** The answer, live (`{ selected }`) or reopened (`{ type: "json", value: { selected } }`); null when unreadable. */
export function readAskUserOutput(output: unknown): AskUserOutput | null {
  if (!output || typeof output !== "object") return null;
  const record = output as Record<string, unknown>;
  const value = record.type === "json" && "value" in record ? record.value : output;
  if (!value || typeof value !== "object") return null;
  const answer = value as Record<string, unknown>;
  if (Array.isArray(answer.selected) && answer.selected.every((id) => typeof id === "string")) {
    return { selected: answer.selected as string[] };
  }
  if (typeof answer.other === "string") return { other: answer.other };
  if (answer.skipped === true) {
    return typeof answer.reason === "string" ? { skipped: true, reason: answer.reason } : { skipped: true };
  }
  return null;
}

/** « Choc, Démo », « Autre : … » (the text alone for a free question), « Passé », « sans réponse »; null without a readable answer. */
export function askUserAnswerText(input: AskUserInput | null, output: AskUserOutput | null): string | null {
  if (!output) return null;
  if ("selected" in output) {
    return output.selected.map((id) => input?.options.find((option) => option.id === id)?.label ?? id).join(", ");
  }
  if ("other" in output) return input && input.options.length === 0 ? output.other : `Autre : ${output.other}`;
  return output.reason === "abandoned" ? "sans réponse" : "Passé";
}

/** Folded step line « <question> : <réponse> », or null when the input or the answer can't be read. */
export function askUserStepLabel(input: unknown, output: unknown): string | null {
  const parsed = parseStoredAskUserInput(input);
  if (!parsed) return null;
  const answer = askUserAnswerText(parsed, readAskUserOutput(output));
  return answer === null ? null : `${parsed.question} : ${answer}`;
}

export type AskUserOptionImage = { src: string; shape: "wide" | "square" };

const SAFE_ID = /^[\w-]+$/;

/** URL and tile shape of an option image; null for anything that is not a known reference. */
export function askUserOptionImage(image: string | undefined): AskUserOptionImage | null {
  if (!image) return null;
  const match = image.match(/^(stored:persona_|stored:sf_|stored:lg_|youtube:|generated:sk_)(.+)$/);
  if (!match || !SAFE_ID.test(match[2])) return null;
  const id = encodeURIComponent(match[2]);
  switch (match[1]) {
    case "stored:persona_":
      return { src: `/api/personas/image?id=${id}&angle=front`, shape: "square" };
    case "stored:sf_":
      return { src: `/api/swipe-files/image?f=${id}`, shape: "wide" };
    case "stored:lg_":
      return { src: `/api/logos/image?f=${id}`, shape: "square" };
    case "generated:sk_":
      return { src: `/api/generated-sketches/sk_${id}`, shape: "wide" };
    default:
      return { src: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`, shape: "wide" };
  }
}
