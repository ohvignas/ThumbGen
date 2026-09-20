/**
 * OpenRouter's image API is a flat `input_references` bag (no per-image role,
 * InstantID, or IP-Adapter). Gemini / GPT Image / Seedream all tell you to
 * assign roles in the prompt by position: edit source vs identity vs logo vs layout.
 *
 * Scratch order is identity → logos → composition refs → one sketch.
 * Adjust order puts the already-generated thumbnail first (OpenAI /v1/images/edits
 * and Gemini/OpenRouter image-to-image keep the richest texture on file 1).
 * generate_sketch classifies refs by prefix (`stored:gi_` = edit source,
 * `stored:lg_` = logo, `generated:` = sketch, else layout).
 */

export const IDENTITY_SUBJECT = "the person in the identity/avatar reference photos";

export type ReferenceRole = "edit" | "identity" | "logo" | "composition" | "sketch";

export type ReferenceEntry = {
  role: ReferenceRole;
  label?: string;
};

export type ReferenceRoleCounts = {
  edit: number;
  identity: number;
  logos: number;
  composition: number;
  sketch: number;
};

export const REFERENCE_ROLE_ORDER: Record<ReferenceRole, number> = {
  edit: 0,
  identity: 1,
  logo: 2,
  composition: 3,
  sketch: 4,
};

export function countReferenceRoles(entries: readonly ReferenceEntry[]): ReferenceRoleCounts {
  const counts: ReferenceRoleCounts = { edit: 0, identity: 0, logos: 0, composition: 0, sketch: 0 };
  for (const entry of entries) {
    if (entry.role === "logo") counts.logos += 1;
    else counts[entry.role] += 1;
  }
  return counts;
}

export function classifySketchReferenceSource(source: string): Exclude<ReferenceRole, "identity"> {
  if (source.startsWith("stored:gi_")) return "edit";
  if (source.startsWith("stored:lg_")) return "logo";
  if (source.startsWith("generated:")) return "sketch";
  return "composition";
}

export function planGenerationReferences(input: {
  editImages?: readonly string[];
  faceImages?: readonly string[];
  logos?: readonly { image: string; label?: string }[];
  referenceImages?: readonly string[];
  sketchImages?: readonly string[];
}): { urls: string[]; entries: ReferenceEntry[] } {
  const urls: string[] = [];
  const entries: ReferenceEntry[] = [];
  const push = (url: string, entry: ReferenceEntry) => {
    urls.push(url);
    entries.push(entry);
  };
  for (const url of input.editImages ?? []) push(url, { role: "edit" });
  for (const url of input.faceImages ?? []) push(url, { role: "identity" });
  for (const logo of input.logos ?? []) push(logo.image, { role: "logo", label: logo.label || "Logo" });
  for (const url of input.referenceImages ?? []) push(url, { role: "composition" });
  for (const url of (input.sketchImages ?? []).slice(0, 1)) push(url, { role: "sketch" });
  return { urls, entries };
}

/**
 * When identity photos are attached, do not describe a generic stranger.
 * Replaces the first stock-person phrase (start of prompt, new line, or after
 * a sentence end) so generate_sketch's "Generate a … draft. Young man" is caught.
 */
export function rewriteGenericSubject(prompt: string): string {
  if (!prompt || /identity\/avatar reference photos/i.test(prompt)) return prompt;
  return prompt.replace(
    /(^|\n|\. )((?:(?:A|An|The|Un|Une|Le|La)\s+)?(?:(?:young|jeune)\s+)?(?:man|woman|guy|girl|person|homme|femme|garçon|fille)\b)/i,
    `$1${IDENTITY_SUBJECT}`,
  );
}

type RoleGroup = { role: ReferenceRole; start: number; count: number; labels: string[] };

function groupConsecutive(entries: readonly ReferenceEntry[]): RoleGroup[] {
  const groups: RoleGroup[] = [];
  for (let i = 0; i < entries.length; ) {
    const { role } = entries[i];
    let j = i;
    const labels: string[] = [];
    while (j < entries.length && entries[j].role === role) {
      const label = entries[j].label?.trim();
      if (label) labels.push(label);
      j += 1;
    }
    groups.push({ role, start: i + 1, count: j - i, labels });
    i = j;
  }
  return groups;
}

function imageRange(start: number, count: number): string {
  if (count === 1) return `Reference image ${start}`;
  return `Reference images ${start} to ${start + count - 1}`;
}

function editBlock(group: RoleGroup): string {
  const which = `${imageRange(group.start, group.count)} ${group.count === 1 ? "is" : "are"}`;
  const that = group.count === 1 ? "that image" : "those images";
  return (
    `${which} the SOURCE THUMBNAIL to edit — this is the current thumbnail; improvements apply to THIS image (same angle). ` +
    `Follow the chain: the original scene is already in ${that}; apply only the changes named in the prompt. ` +
    `Preserve everything else — composition, identity, pose, logos, typography, lighting, and color — unless the prompt names it. ` +
    `Do not recreate the scene from scratch.`
  );
}

function identityBlock(group: RoleGroup): string {
  const which = `${imageRange(group.start, group.count)} ${group.count === 1 ? "is" : "are"}`;
  const angles =
    group.count > 1
      ? " They show the same person from multiple angles — one identity, not several people."
      : "";
  return (
    `${which} the IDENTITY / AVATAR of one real person — a STRICT reference for that person's face.${angles} ` +
    `This is the only allowed face and head. The thumbnail subject is ${IDENTITY_SUBJECT}. ` +
    `Preserve their identity, facial structure, eyes, nose, mouth, jawline, hair, and skin tone exactly. ` +
    `Do not invent a new head, do not generate a different person or a beautified lookalike. ` +
    `Pose, expression, clothing, and camera may change.`
  );
}

function logoBlock(group: RoleGroup): string {
  const which =
    group.count === 1
      ? `${imageRange(group.start, group.count)} is a logo`
      : `${imageRange(group.start, group.count)} are logos`;
  const names = (
    group.labels.length > 0 ? group.labels : Array.from({ length: group.count }, () => "Logo")
  )
    .map((label) => label.trim() || "Logo")
    .join(", ");
  return `${which} to include in the thumbnail: ${names}. Place each logo visibly and keep it recognizable — not distorted or blended into the background.`;
}

function compositionBlock(group: RoleGroup): string {
  const which = `${imageRange(group.start, group.count)} ${group.count === 1 ? "is" : "are"}`;
  const those = group.count === 1 ? "that image" : "those images";
  return (
    `${which} COMPOSITION / LAYOUT only (competitor thumbnail, swipe, or style board). ` +
    `Copy framing, text placement, and graphic layout. NEVER copy a face, head, or identity from ${those}. ` +
    `If a layout image contains a person, ignore that identity completely.`
  );
}

function sketchBlock(group: RoleGroup, isLast: boolean): string {
  const who =
    isLast && group.count === 1 ? "The last reference image" : imageRange(group.start, group.count);
  const verb = group.count === 1 ? "is" : "are";
  return (
    `${who} ${verb} a rough COMPOSITION SKETCH. Match its layout and where elements are placed, not its hand-drawn style — ` +
    `the result must look polished and professional. Do not copy a face from the sketch.`
  );
}

/** Prompt appendix that names each `input_references` slot by role. Empty when nothing is attached. */
export function buildReferenceRolePrompt(entries: readonly ReferenceEntry[]): string {
  const groups = groupConsecutive(entries);
  return groups
    .map((group, i) => {
      const isLast = i === groups.length - 1;
      switch (group.role) {
        case "edit":
          return editBlock(group);
        case "identity":
          return identityBlock(group);
        case "logo":
          return logoBlock(group);
        case "composition":
          return compositionBlock(group);
        case "sketch":
          return sketchBlock(group, isLast);
      }
    })
    .join("\n\n");
}

export function applyReferenceRolesToPrompt(prompt: string, entries: readonly ReferenceEntry[]): string {
  const hasIdentity = entries.some((entry) => entry.role === "identity");
  const fallback = prompt.trim() ? prompt : "Generate a YouTube thumbnail image.";
  const scene = hasIdentity ? rewriteGenericSubject(fallback) : fallback;
  const roles = buildReferenceRolePrompt(entries);
  return roles ? `${scene}\n\n${roles}` : scene;
}
