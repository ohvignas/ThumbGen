import type { StudioDraft, TitleVariant } from "./types";

const EMPTY_VARIANT: TitleVariant = { title: "", thumbText: "", visualConcept: "" };

export function emptyStudioDraft(): StudioDraft {
  return {
    script: "",
    description: "",
    titleVariants: [{ ...EMPTY_VARIANT }, { ...EMPTY_VARIANT }, { ...EMPTY_VARIANT }],
  };
}

export function isNewTemplateMarkdown(markdown: string): boolean {
  return markdown.includes("Script Vidéo longue") && markdown.includes("## A/B Titre");
}

function extractToggleCode(markdown: string, summary: string): string {
  const escaped = summary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `<summary>\\s*${escaped}\\s*</summary>\\s*\`\`\`(?:javascript|markdown|text)?\\s*([\\s\\S]*?)\`\`\``,
    "i",
  );
  return markdown.match(re)?.[1]?.trim() ?? "";
}

function parseAbTable(markdown: string): StudioDraft["titleVariants"] {
  const variants = emptyStudioDraft().titleVariants;
  const section = markdown.split("## A/B Titre")[1] ?? "";
  const rows = [...section.matchAll(/^\|\s*([^|]+)\|\s*([^|]+)\|\s*([^|]+)\|/gm)]
    .map((match) => ({
      title: match[1].trim(),
      thumbText: match[2].trim(),
      visualConcept: match[3].trim(),
    }))
    .filter((row) => !/^titre$/i.test(row.title) && !/^---/.test(row.title));
  for (let i = 0; i < 3; i += 1) variants[i] = rows[i] ?? { ...EMPTY_VARIANT };
  return variants;
}

export function parseStudioPageMarkdown(markdown: string): StudioDraft {
  if (!isNewTemplateMarkdown(markdown)) {
    return { ...emptyStudioDraft(), script: markdown.trim() };
  }
  return {
    script: extractToggleCode(markdown, "Script Vidéo longue"),
    description: extractToggleCode(markdown, "Description"),
    titleVariants: parseAbTable(markdown),
  };
}

export function renderStudioPageMarkdown(draft: StudioDraft): string {
  const rows = draft.titleVariants
    .map((row) => `| ${row.title} | ${row.thumbText} | ${row.visualConcept} |`)
    .join("\n");
  return [
    "SCRIPT",
    "<details>",
    "<summary>Script Vidéo longue</summary>",
    "",
    "```javascript",
    draft.script.trim() || "{Script complet}",
    "```",
    "",
    "</details>",
    "<details>",
    "<summary>Description</summary>",
    "",
    "```javascript",
    draft.description.trim() ||
      "{description}\n👉 Ce que vous allez apprendre :\n✅ {Point clés}\n\n⌚️ Les temps forts de la vidéo :\n00:00 {Titre moments}",
    "```",
    "",
    "</details>",
    "---",
    "## A/B Titre",
    "| Titre | Texte miniature | Concept visuel |",
    "| --- | --- | --- |",
    rows,
    "---",
    "## Miniature",
    "",
    "Miniature A",
    "",
    "Miniature B",
    "",
    "Miniature C",
    "",
  ].join("\n");
}
