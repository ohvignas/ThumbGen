import { readSkillBody } from "./catalog";
import { parseInvokedSkillFromText } from "./slash-query";

export type InvokedSkill = {
  slash: string;
  skill: string;
  title: string;
  body: string;
};

export function resolveInvokedSkill(userText: string): InvokedSkill | null {
  const entry = parseInvokedSkillFromText(userText);
  if (!entry) return null;
  const body = readSkillBody(entry.skill);
  if (!body) return null;
  return { slash: entry.slash, skill: entry.skill, title: entry.title, body };
}

/** Model-facing stand-in when the bubble is only `/croquis` (OpenRouter rejects an empty user turn). */
export function emptyInvokedUserMessage(invoked: InvokedSkill): string {
  return [
    `The user invoked /${invoked.slash} (${invoked.title}) with no extra description.`,
    "The idea is empty.",
    `Follow <invoked_skill>: call ask_user this turn to brainstorm. Do not call ${invoked.skill} yet. Do not call finish_turn in the same step as ask_user.`,
  ].join(" ");
}

export function buildInvokedSkillBlock(invoked: InvokedSkill, options?: { ideaEmpty?: boolean }): string {
  const ideaLines = options?.ideaEmpty
    ? [
        "The user sent only the slash command with no extra description. The idea is EMPTY.",
        `You MUST call ask_user this turn to brainstorm (topic, subject, angle). Do NOT call ${invoked.skill} this turn. Do NOT call finish_turn in the same step as ask_user. Do not use web search.`,
      ]
    : [
        "If the idea is still empty, brainstorm with the user first (ask_user), then continue the skill. Do not mention a 7-step journey.",
      ];
  return [
    `<invoked_skill name="${invoked.skill}" slash="${invoked.slash}">`,
    `The user explicitly invoked this skill with /${invoked.slash} (${invoked.title}). Follow it this turn.`,
    `These instructions are already loaded — do not call read_skill for "${invoked.skill}" unless you need a re-read. You may read_skill other skills this one names.`,
    ...ideaLines,
    "",
    invoked.body,
    "</invoked_skill>",
  ].join("\n");
}
