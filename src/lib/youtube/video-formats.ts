/**
 * Closed YouTube *format* taxonomy (how the video is built), not scraped
 * title tokens. Labels are FR. Assignment is a local keyword/pattern
 * classifier on title + description (+ duration for Shorts).
 *
 * Sources: Little Monster Media / Tubefilter 2019 structural formats
 * (listicle, explainer, commentary, interview, reaction, …) plus the
 * creator-industry staples the swipe file actually needs (tutoriel,
 * documentaire, test, vlog, actu, compilation, format court, comparatif,
 * étude de cas). « Autre format » is a filter bucket, never a winner.
 */

export const OTHER_FORMAT_ID = "other";
export const OTHER_FORMAT_LABEL = "Autre format";

export const VIDEO_FORMATS = [
  { id: "tutorial", label: "Tutoriel" },
  { id: "documentary", label: "Documentaire" },
  { id: "review", label: "Test / avis" },
  { id: "vlog", label: "Vlog" },
  { id: "news", label: "Actualités" },
  { id: "interview", label: "Interview" },
  { id: "compilation", label: "Compilation" },
  { id: "shorts", label: "Format court" },
  { id: "comparison", label: "Comparatif" },
  { id: "case_study", label: "Étude de cas" },
  { id: "listicle", label: "Liste" },
  { id: "commentary", label: "Commentaire" },
] as const;

export type NamedVideoFormatId = (typeof VIDEO_FORMATS)[number]["id"];
export type VideoFormatId = NamedVideoFormatId | typeof OTHER_FORMAT_ID;

export const VIDEO_FORMAT_IDS = VIDEO_FORMATS.map((format) => format.id) as [NamedVideoFormatId, ...NamedVideoFormatId[]];

export const VIDEO_FORMAT_OPTIONS: ReadonlyArray<{ id: VideoFormatId; label: string }> = [
  ...VIDEO_FORMATS,
  { id: OTHER_FORMAT_ID, label: OTHER_FORMAT_LABEL },
];

const SHORTS_MAX_SECONDS = 60;
const DESCRIPTION_CHARS = 500;
const TITLE_WEIGHT = 3;
const DESC_WEIGHT = 1;

/** More specific contracts win ties (list/vs/case before vlog). */
const TIE_BREAK: readonly VideoFormatId[] = [
  "shorts",
  "listicle",
  "comparison",
  "case_study",
  "interview",
  "tutorial",
  "review",
  "documentary",
  "news",
  "compilation",
  "commentary",
  "vlog",
  OTHER_FORMAT_ID,
];

const PATTERNS: Record<NamedVideoFormatId, readonly RegExp[]> = {
  tutorial: [
    /\btuto(?:riel)?s?\b/,
    /\btutorials?\b/,
    /\bhow to\b/,
    /\bcomment (?:faire|utiliser|installer|creer|monter|configurer)\b/,
    /\bpas a pas\b/,
    /\bstep by step\b/,
    /\bguide (?:complet|pratique|debutant)\b/,
    /\bapprendre a\b/,
  ],
  documentary: [
    /\bdocumentaires?\b/,
    /\bdocumentar(?:y|ies)\b/,
    /\benquetes?\b/,
    /\breportages?\b/,
    /\bl['']histoire de\b/,
    /\bthe (?:rise|fall|story) of\b/,
    /\bdeep dives?\b/,
    /\bmini[- ]docs?\b/,
  ],
  review: [
    /\breviews?\b/,
    /\bunboxings?\b/,
    /\bdeballages?\b/,
    /\b(?:j['']ai )?teste\b/,
    /\bpremier avis\b/,
    /\bfirst look\b/,
    /\bhands[- ]?on\b/,
    /\btest (?:complet|du|de|des|le)\b/,
    /\bavis (?:sur|complet|honnete)\b/,
  ],
  vlog: [/\bvlogs?\b/, /\bday in the life\b/, /\bjournee (?:type|avec|de|dans)\b/, /\bcoulisses\b/, /\bbehind the scenes\b/, /\bvlogmas\b/],
  news: [
    /\bactualites?\b/,
    /\bbreaking news\b/,
    /\bles news\b/,
    /\bflash info\b/,
    /\bderniere heure\b/,
    /\bce qui se passe\b/,
    /\brecap (?:actu|de l['']actu|info)\b/,
  ],
  interview: [
    /\binterviews?\b/,
    /\bentretiens?\b/,
    /\bpodcasts?\b/,
    /\bq\s*&\s*a\b/,
    /\bquestions?[ -]reponses?\b/,
    /\ben discussion avec\b/,
    /\binvite(?:e)?\b/,
  ],
  compilation: [
    /\bcompilations?\b/,
    /\bbest[- ]ofs?\b/,
    /\bhighlights?\b/,
    /\bmeilleurs moments\b/,
    /\bfunny moments\b/,
    /\brecap (?:des|de la)\b/,
  ],
  shorts: [/#shorts\b/, /\byoutube shorts\b/, /\bformat court\b/],
  comparison: [/\bvs\.?\b/, /\bversus\b/, /\bcomparatifs?\b/, /\bcomparaisons?\b/, /\blequel choisir\b/, /\bwhich (?:is )?(?:better|best)\b/],
  case_study: [
    /\betude de cas\b/,
    /\bcase stud(?:y|ies)\b/,
    /\bcomment (?:j['']ai|nous avons|ils ont)\b/,
    /\bhow i (?:built|made|grew|got|hit)\b/,
    /\banalyse (?:de|d['']une|complete|detaillee)\b/,
  ],
  listicle: [
    /\btop\s*\d+\b/,
    /\b\d+\s*(?:choses|facons|raisons|astuces|tips|ways|things|erreurs|idees|outils)\b/,
    /\bles\s+\d+\s+(?:meilleurs|pires|plus)\b/,
    /\bcountdowns?\b/,
    /\brankings?\b/,
    /\bclassements?\b/,
  ],
  commentary: [
    /\bcommentaires?\b/,
    /\bcommentary\b/,
    /\breactions?\b/,
    /\breacts?\b/,
    /\bvideo essays?\b/,
    /\bessais? videos?\b/,
    /\bmon take\b/,
    /\bje reponds\b/,
  ],
};

export function isVideoFormat(value: unknown): value is VideoFormatId {
  return value === OTHER_FORMAT_ID || (typeof value === "string" && (VIDEO_FORMAT_IDS as readonly string[]).includes(value));
}

export function isNamedVideoFormat(value: unknown): value is NamedVideoFormatId {
  return typeof value === "string" && (VIDEO_FORMAT_IDS as readonly string[]).includes(value);
}

export function videoFormatLabel(id: string | null | undefined): string {
  if (id === OTHER_FORMAT_ID) return OTHER_FORMAT_LABEL;
  return VIDEO_FORMATS.find((format) => format.id === id)?.label ?? OTHER_FORMAT_LABEL;
}

export function foldFormatText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/['’]/g, "'");
}

function hits(haystack: string, patterns: readonly RegExp[]): number {
  let count = 0;
  for (const pattern of patterns) {
    if (pattern.test(haystack)) count += 1;
  }
  return count;
}

const SHORTS_MARKERS = /#shorts\b|\byoutube shorts\b|\bformat court\b/;

function isShortsStyle(title: string, durationSeconds: number | null | undefined): boolean {
  if (typeof durationSeconds === "number" && durationSeconds > 0 && durationSeconds <= SHORTS_MAX_SECONDS) return true;
  return SHORTS_MARKERS.test(title);
}

/** Duration ≤ 60s, or a Shorts / « format court » marker in title or description. */
export function isYouTubeShort(
  title: string,
  description?: string | null,
  durationSeconds?: number | null,
): boolean {
  const foldedTitle = foldFormatText(title);
  if (isShortsStyle(foldedTitle, durationSeconds)) return true;
  return SHORTS_MARKERS.test(foldFormatText((description ?? "").slice(0, DESCRIPTION_CHARS)));
}

/**
 * One format per video. Shorts (duration or title marker) win first.
 * Otherwise the highest weighted pattern score; ties use TIE_BREAK.
 * No TypeSafe / LLM — deterministic and local.
 */
export function classifyVideoFormat(
  title: string,
  description?: string | null,
  durationSeconds?: number | null,
): VideoFormatId {
  const foldedTitle = foldFormatText(title);
  if (isShortsStyle(foldedTitle, durationSeconds)) return "shorts";

  const foldedDesc = foldFormatText((description ?? "").slice(0, DESCRIPTION_CHARS));
  let best: VideoFormatId = OTHER_FORMAT_ID;
  let bestScore = 0;

  for (const format of VIDEO_FORMATS) {
    if (format.id === "shorts") continue;
    const score = hits(foldedTitle, PATTERNS[format.id]) * TITLE_WEIGHT + hits(foldedDesc, PATTERNS[format.id]) * DESC_WEIGHT;
    if (score === 0) continue;
    if (score > bestScore) {
      best = format.id;
      bestScore = score;
      continue;
    }
    if (score === bestScore && TIE_BREAK.indexOf(format.id) < TIE_BREAK.indexOf(best)) {
      best = format.id;
    }
  }

  return best;
}
