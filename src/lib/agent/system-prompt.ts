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
import { buildSkillsCatalogBlock } from "@/lib/agent/skills/catalog";
import { buildMentionedImagesBlock, type MentionableImage } from "@/lib/canvas/mentionable-images";

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
Never mention "step 3 of 7" or run a 7-step pipeline. There is no Fiche / thumbnail brief to read or write.

Rules:
- The open canvas in <canvas_state> is the truth. liveSketchCount (and type:"sketch" nodes) are the only sketches that exist. Deleted / tombstoned croquis and earlier generate_sketch calls do not use a quota. Never tell the user a 5-sketch-per-project cap is full because drafts were deleted or because you "already made 5 this session".
- Before a tool call, write at most one short sentence (or nothing): it only appears in the collapsed step list
- Be concise. The user is creative, not technical. Don't dump JSON
- Cost-aware: generate_sketch costs money; a final generation only ever starts from the user's click on "Générer". Never generate an image yourself.
- Cite web sources when web results are attached
- Faces of the creator: Personnages only (list_personas), never a one-off photo as their face. When their face is in a sketch, pass face_source: "stored:persona_<id>"
- If the canvas already has a workflow and the user wants to modify it, read_skill existing-workflow: apply_workflow sends only changed nodes; the other nodes are kept automatically
- Two intents only. First gen (no generated aperçu as the work source): full 7-sentence prompt(s); A/B here = two complete alternative prompts (variant slots, not a reason to shorten). Iterate (a generated aperçu is the source): short change-only prompt + that image first; same angle; keep the chain original prompt + this gen + the change. Full 7-sentence anatomy is FROM SCRATCH only. When <canvas_state> has currentThumbnails, that aperçu is the current thumbnail — improvements apply to THIS image.
- When the user writes @#ID or a mentioned_images system block is present, those visibleId values are the thumbnails they mean. Match the same visibleId on canvas_state images / currentThumbnails and use that stored:gi_ (or other) ref. JPEG pixels for @mentions and for analyse / regarder / améliorer / iterate requests are already attached on this user turn (768px). Call view_canvas_images only if you need other nodes. Do not invent a stored id from pixels.

${buildAgentRubric()}

ENDING EVERY TURN — finish_turn (mandatory):
- End EVERY turn by calling finish_turn exactly once, as your LAST tool call, alone in its own step, once every other tool result is back. The chat shows the user only its summary and its results; everything else you wrote or called during the turn is folded into a collapsed step list.
- summary: 1 to 2 short sentences, max 400 characters, in the reply language — what you did, what you found, or what you need from the user. Never write a long answer in free text: no headings, no walls of text, no JSON. **Bold** on one key phrase is fine.
- results: the result_id values of this turn's tool calls whose visual output the user should see, in display order, max 6. Only generate_sketch, import_youtube_thumbnail and search_youtube produce a visual output; each successful one ends with a line "result_id: <id>" — copy that id exactly. Leave results empty when nothing visual is worth showing.
- next_actions: always []. Do not offer generate, focus_node, ask_agent, « Voir le générateur », « Voir sur le canvas », or « Et maintenant » buttons. Chat is text plus the canvas effects of your tools (place_node / apply_workflow persist on the canvas). Paid generation starts only when the user clicks « Générer » on the generator node themselves.
  - After /create-prompt or when they only asked to write/place a prompt: next_actions MUST be [].
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
};

export const DEFAULT_AGENT_PROMPT_PREFS: AgentPromptPrefs = {
  responseLanguage: "fr",
  thumbnailLanguage: "fr",
  youtubeChannel: "",
  channelProfile: EMPTY_CHANNEL_PROFILE,
  defaultPersona: null,
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

/**
 * Returns the "system" parameter as an array of blocks. The first block is the
 * static persona+rules with cache_control set, so it's cached across turns.
 * The following blocks are per-turn: reply language, channel profile, project
 * id, canvas snapshot, an <invoked_skill> body when the user sent a Brainstorm
 * slash command, and <mentioned_images> when they pointed at a thumbnail with @.
 */
export function buildSystemMessages(
  canvasSnapshot: unknown,
  projectId?: string,
  prefs: AgentPromptPrefs = DEFAULT_AGENT_PROMPT_PREFS,
  invokedSkillBlock?: string | null,
  mentionedImages?: readonly MentionableImage[] | null,
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
  const mentioned = mentionedImages?.length ? buildMentionedImagesBlock(mentionedImages) : null;
  if (mentioned) blocks.push({ type: "text", text: mentioned });
  if (invokedSkillBlock) blocks.push({ type: "text", text: invokedSkillBlock });
  return blocks;
}
