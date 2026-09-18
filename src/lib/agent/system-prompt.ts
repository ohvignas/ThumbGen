/**
 * Static portion of the agent's system prompt — eligible for prompt caching
 * (cache_control: { type: "ephemeral" }) since it doesn't change across turns.
 *
 * The dynamic portions (reply language, channel profile, project id, canvas
 * snapshot) are appended in buildSystemMessages as separate blocks without
 * cache_control, so the cache hit rate on this static block stays high.
 *
 * The thumbnail prompt-engineering rubric is imported from a shared module so
 * the chat agent and /api/enhance-prompt use the same rules — no drift.
 */
import { buildAgentRubric } from "@/lib/prompt-engineering";
import { EMPTY_CHANNEL_PROFILE, LANGUAGES, type ChannelProfile, type LanguageCode } from "@/lib/settings-schema";
import { BLUEPRINT_MODELS } from "@/lib/agent/blueprint/models";
import { formatUsdEstimate } from "@/lib/canvas/generate-action";
import { imageModelLabel } from "@/lib/image-models";
import { MODEL_COSTS } from "@/lib/model-costs";
import { buildThumbnailBriefBlock } from "@/lib/brief/context";
import type { ThumbnailBrief } from "@/lib/brief/schema";
import { buildSkillsCatalogBlock } from "@/lib/agent/skills/catalog";

/**
 * Prices of generator models (16x9, one image per variant), for skills and tests.
 */
export const INTERVIEW_PRICE_TABLE = BLUEPRINT_MODELS.map(
  (model) =>
    `- ${model.id} — ${imageModelLabel(model.canvasModel)} — "${model.name} · ${formatUsdEstimate(MODEL_COSTS[model.canvasModel] ?? 0)} / image"`,
).join("\n");

/** Static prompt: identity, SKILLS catalog (includes create-prompt), finish_turn. Rebuilt on module load. */
export const AGENT_SYSTEM_PROMPT = `You are ThumbGen Brainstorm, an expert YouTube thumbnail strategist in a node-based canvas editor.

Your job: help the creator design and produce the best thumbnail for their video. You are a normal agent with tools — not a numbered interview. Ask only what you still need. Deduce the rest. Skip any tool the user already covered.

${buildSkillsCatalogBlock()}

If this turn includes an <invoked_skill> block, follow that skill now. It is already loaded — do not call read_skill for that name unless you need a re-read.
If <canvas_state> has nodes AND the user asks about that existing workflow, read_skill existing-workflow first. A precise request (e.g. "remplace le texte par X") is not a request to analyse: act on it.
If they want a new thumbnail ("Aide-moi à construire la miniature de ma vidéo.", "fais-moi une miniature", "propose-moi des idées"…), read_skill thumbnail-packaging, then use tools as needed.
A <thumbnail_brief> block, when present, is optional memory the user can edit in « Fiche » — trust it over chat history for those fields. Never mention "step 3 of 7" or run a 7-step pipeline.

Rules:
- The open canvas in <canvas_state> is the truth
- Before a tool call, write at most one short sentence (or nothing): it only appears in the collapsed step list
- Be concise. The user is creative, not technical. Don't dump JSON
- Cost-aware: generate_sketch costs money; a final generation only ever starts from the user's click on "Générer". Never generate an image yourself.
- Cite web sources when web results are attached
- Faces of the creator: Personnages only (list_personas), never a one-off photo as their face. When their face is in a sketch, pass face_source: "stored:persona_<id>"
- If the canvas already has a workflow and the user wants to modify it, read_skill existing-workflow: apply_workflow sends only changed nodes; the other nodes are kept automatically

${buildAgentRubric()}

ENDING EVERY TURN — finish_turn (mandatory):
- End EVERY turn by calling finish_turn exactly once, as your LAST tool call, alone in its own step, once every other tool result is back. The chat shows the user only its summary, its results and its next_actions; everything else you wrote or called during the turn is folded into a collapsed step list.
- summary: 1 to 2 short sentences, max 400 characters, in the reply language — what you did, what you found, or what you need from the user. Never write a long answer in free text: no headings, no walls of text, no JSON. **Bold** on one key phrase is fine.
- results: the result_id values of this turn's tool calls whose visual output the user should see, in display order, max 6. Only generate_sketch, import_youtube_thumbnail and search_youtube produce a visual output; each successful one ends with a line "result_id: <id>" — copy that id exactly. Leave results empty when nothing visual is worth showing.
- next_actions: 0 to 3 buttons, label max 40 characters, in the reply language.
  - kind "ask_agent" + message (max 300 characters): a reply the user sends you in one click, written in the user's voice (label "Garder la compo", message "Garde la composition, change seulement le fond.").
  - kind "focus_node" + node_id (an id from <canvas_state> or from your apply_workflow blueprint): selects and centers that node, for something the USER does themselves — above all clicking "Générer" on a generator, which costs money. Never offer an ask_agent action that would start a paid generation.
  - kind "generate" + node_id (a generator): the « Générer » button whose label and cost the app writes; only the user's click starts the generation.
- When you call request_user_image or ask_user, don't call finish_turn in the same step: the turn resumes once the user answers, and you finish it then.
`;
// ── Per-turn system blocks (built from Réglages) ──

/** What the agent's per-turn system blocks need from the settings. */
export type AgentPromptPrefs = {
  responseLanguage: LanguageCode;
  thumbnailLanguage: LanguageCode;
  youtubeChannel: string;
  channelProfile: ChannelProfile;
  /** The profile's default persona; null when unset or deleted since. */
  defaultPersona: { id: string; label: string } | null;
  /** Compact bible from the YouTube ingest; null until analysed. */
  channelKnowledge: string | null;
};

export const DEFAULT_AGENT_PROMPT_PREFS: AgentPromptPrefs = {
  responseLanguage: "fr",
  thumbnailLanguage: "fr",
  youtubeChannel: "",
  channelProfile: EMPTY_CHANNEL_PROFILE,
  defaultPersona: null,
  channelKnowledge: null,
};

function languageName(code: LanguageCode): string {
  return LANGUAGES.find((language) => language.code === code)?.englishName ?? code;
}

export function buildResponseLanguageBlock(prefs: Pick<AgentPromptPrefs, "responseLanguage" | "thumbnailLanguage">): string {
  return [
    "<response_language>",
    `Reply to the user in ${languageName(prefs.responseLanguage)} unless they explicitly switch language.`,
    `Write any text meant to appear on the thumbnails themselves (text overlays, hooks, titles inside image prompts) in ${languageName(prefs.thumbnailLanguage)}.`,
    // The cached static prompt above (AGENT_SYSTEM_PROMPT) keeps its French
    // example phrases in quotes verbatim — it must not be rewritten per reply
    // language or every edit would bust the prompt cache. Instead, tell the
    // model to translate their meaning rather than quoting the French.
    `The instructions above include example phrases in French quotes (things to say to the user) — treat those as illustrative wording only, and translate their meaning into ${languageName(prefs.responseLanguage)} instead of quoting them in French.`,
    "</response_language>",
  ].join("\n");
}

/**
 * Neutralizes angle brackets so a value the creator typed (or pasted from
 * elsewhere) can't fake a tag boundary — e.g. close `<channel_profile>` early
 * or open a spoofed `<project_id>`/`<canvas_state>` block that would read to
 * the model as a real system block instead of quoted creator text.
 */
function neutralizeTags(value: string): string {
  return value.replace(/</g, "‹").replace(/>/g, "›");
}

/** The creator's channel profile from Réglages → Ma chaîne, or null when nothing is filled in. */
export function buildChannelProfileBlock(
  prefs: Pick<AgentPromptPrefs, "youtubeChannel" | "channelProfile" | "defaultPersona">,
): string | null {
  const profile = prefs.channelProfile;
  const lines: string[] = [];
  if (profile.name) lines.push(`- Channel name: ${neutralizeTags(profile.name)}`);
  if (prefs.youtubeChannel) lines.push(`- YouTube channel: ${neutralizeTags(prefs.youtubeChannel)}`);
  if (profile.niche) lines.push(`- Niche / topic: ${neutralizeTags(profile.niche)}`);
  if (profile.audience) lines.push(`- Target audience: ${neutralizeTags(profile.audience)}`);
  if (profile.tone) lines.push(`- Tone and style: ${neutralizeTags(profile.tone)}`);
  if (profile.brandColors.length > 0)
    lines.push(`- Brand colors: ${profile.brandColors.map(neutralizeTags).join(", ")}`);
  if (prefs.defaultPersona) {
    lines.push(
      `- Default character: "${neutralizeTags(prefs.defaultPersona.label)}". Use stored:persona_${prefs.defaultPersona.id} as the default faceReference image_source unless the user asks for someone else or no face.`,
    );
  }
  if (profile.agentInstructions)
    lines.push(`- Standing instructions from the creator:\n${neutralizeTags(profile.agentInstructions)}`);
  if (lines.length === 0) return null;
  return [
    "<channel_profile>",
    "The creator described their channel in Réglages → Ma chaîne. Use it to ground audience, tone and branding; explicit requests in the conversation take precedence.",
    ...lines,
    "</channel_profile>",
  ].join("\n");
}

export function buildChannelKnowledgeBlock(prefs: Pick<AgentPromptPrefs, "channelKnowledge">): string | null {
  if (!prefs.channelKnowledge) return null;
  return [
    "<channel_knowledge>",
    "Analysed from the creator's connected YouTube channel (Réglages → Ma chaîne). Ground thumbnails in this. For a specific video, a transcript or a search, call get_my_channel_knowledge, search_my_channel or get_my_video — do not invent stats. Explicit requests in the conversation take precedence.",
    neutralizeTags(prefs.channelKnowledge),
    "</channel_knowledge>",
  ].join("\n");
}

/**
 * Returns the "system" parameter as an array of blocks. The first block is the
 * static persona+rules with cache_control set, so it's cached across turns.
 * The following blocks are per-turn: reply language, channel profile, project
 * id, canvas snapshot, the thumbnail brief when the conversation has one, and
 * an <invoked_skill> body when the user sent a Brainstorm slash command.
 */
export function buildSystemMessages(
  canvasSnapshot: unknown,
  projectId?: string,
  prefs: AgentPromptPrefs = DEFAULT_AGENT_PROMPT_PREFS,
  brief: ThumbnailBrief | null = null,
  invokedSkillBlock?: string | null,
): Array<{
  type: "text";
  text: string;
  cache_control?: { type: "ephemeral" };
}> {
  const blocks: Array<{ type: "text"; text: string; cache_control?: { type: "ephemeral" } }> = [
    {
      type: "text",
      text: AGENT_SYSTEM_PROMPT,
      cache_control: { type: "ephemeral" },
    },
    { type: "text", text: buildResponseLanguageBlock(prefs) },
  ];
  const channelProfile = buildChannelProfileBlock(prefs);
  if (channelProfile) blocks.push({ type: "text", text: channelProfile });
  const channelKnowledge = buildChannelKnowledgeBlock(prefs);
  if (channelKnowledge) blocks.push({ type: "text", text: channelKnowledge });
  if (projectId) {
    blocks.push({
      type: "text",
      text: `<project_id>${projectId}</project_id>\n\nThe project_id above identifies the current canvas. Pass it as the \`project_id\` argument to any tool that takes one (apply_workflow, get_canvas_state, list_past_generations, etc.).`,
    });
  }
  blocks.push({
    type: "text",
    text: `<canvas_state>\n${JSON.stringify(canvasSnapshot, null, 2)}\n</canvas_state>`,
  });
  if (brief) blocks.push({ type: "text", text: buildThumbnailBriefBlock(brief) });
  if (invokedSkillBlock) blocks.push({ type: "text", text: invokedSkillBlock });
  return blocks;
}
