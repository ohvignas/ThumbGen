import { z } from "zod";

/**
 * `ask_user`: one clickable question card. A client tool — no `execute`: the
 * turn pauses until the chat answers `{ selected }`, `{ other }` or `{ skipped }`.
 * With no option it is a free question answered with `{ other }`. Pure — shared
 * by the chat route's tool declaration, the question card and the turn model.
 */
export const ASK_USER_TOOL_NAME = "ask_user";

/** Leftover bound on stored `step` (old 1–7 cards, plus F2's step 8 remapped here). */
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
      "Ignored by the chat card. Do not send. Options are text only (label + description). Never attach a persona, logo, canvas, YouTube, sketch, or URL image as the choice visual.",
    ),
});

const askUserObjectSchema = z.object({
  question: z.string().trim().min(1).max(ASK_USER_LIMITS.question).describe("The question, max 200 characters."),
  // Optional so old stored cards still parse. No .describe(): the model must not see a step field.
  step: z.number().int().min(1).max(ASK_USER_TOTAL_STEPS).optional(),
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
});

function refineAskUserInput(
  input: { multiple: boolean; max_selected?: number; options: Array<{ id: string }> },
  ctx: z.RefinementCtx,
) {
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
}

export const askUserInputSchema = askUserObjectSchema.superRefine(refineAskUserInput);

/** What the model is allowed to send: same card, without leftover `step`. */
export const askUserToolInputSchema = askUserObjectSchema.omit({ step: true }).superRefine(refineAskUserInput);

export type AskUserInput = z.output<typeof askUserInputSchema>;
export type AskUserOption = AskUserInput["options"][number];

export type AskUserOutput = { selected: string[] } | { other: string } | { skipped: true; reason?: string };

export function parseAskUserInput(input: unknown): AskUserInput | null {
  const parsed = askUserInputSchema.safeParse(input);
  return parsed.success ? parsed.data : null;
}

/** F2's last question (« Question 8/8 »), still found in stored conversations. */
const F2_LAST_STEP = 8;

/**
 * For folded history lines: also reads a question stored by F2 with step 8.
 * New calls omit `step`.
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
export function askUserOptionImage(image: string | undefined, conversationId?: string | null): AskUserOptionImage | null {
  if (!image) return null;
  if (image.startsWith("logo-candidate:") && conversationId) {
    const id = image.slice("logo-candidate:".length);
    if (!SAFE_ID.test(id)) return null;
    return { src: `/api/briefs/${encodeURIComponent(conversationId)}/logo-candidates/${encodeURIComponent(id)}`, shape: "square" };
  }
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
