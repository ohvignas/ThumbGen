import { ageInDays, median } from "./performance";
import { MIN_SCORED_FOR_RANKING } from "./thumb-types";

/** Leftover videos that share no title/description topic with another video. */
export const OTHER_THEME_ID = "autres-sujets";
export const OTHER_THEME_LABEL = "Autres sujets";

const DESCRIPTION_CHARS = 500;

/** French + English function words and YouTube title/description filler — not topics. */
const STOP = new Set([
  "a",
  "ai",
  "about",
  "after",
  "all",
  "aller",
  "alors",
  "an",
  "and",
  "any",
  "apres",
  "are",
  "as",
  "at",
  "aucun",
  "aussi",
  "aux",
  "avant",
  "avec",
  "avoir",
  "be",
  "been",
  "before",
  "best",
  "better",
  "bien",
  "but",
  "by",
  "ca",
  "can",
  "car",
  "ce",
  "ceci",
  "cela",
  "ces",
  "cet",
  "cette",
  "ceux",
  "chez",
  "com",
  "comme",
  "comment",
  "complet",
  "contre",
  "croire",
  "dans",
  "de",
  "des",
  "description",
  "depuis",
  "donc",
  "dont",
  "drop",
  "du",
  "elle",
  "elles",
  "en",
  "entre",
  "episode",
  "est",
  "et",
  "ete",
  "etre",
  "exclusive",
  "expliqué",
  "explique",
  "explication",
  "fait",
  "faire",
  "fais",
  "first",
  "for",
  "formation",
  "from",
  "gratuitement",
  "guide",
  "https",
  "http",
  "how",
  "ici",
  "il",
  "ils",
  "in",
  "into",
  "impressionnant",
  "installer",
  "installation",
  "intro",
  "is",
  "it",
  "its",
  "jai",
  "je",
  "jour",
  "just",
  "laisse",
  "laisser",
  "la",
  "le",
  "les",
  "leur",
  "leurs",
  "lien",
  "like",
  "mais",
  "mal",
  "ma",
  "me",
  "mes",
  "minute",
  "minutes",
  "mise",
  "moi",
  "mois",
  "moins",
  "mon",
  "more",
  "most",
  "my",
  "ne",
  "news",
  "new",
  "ni",
  "no",
  "non",
  "nos",
  "not",
  "notre",
  "nous",
  "nouveau",
  "nouvelle",
  "of",
  "officiel",
  "official",
  "on",
  "ont",
  "or",
  "ou",
  "oui",
  "our",
  "out",
  "over",
  "par",
  "parle",
  "parmi",
  "pas",
  "pendant",
  "plans",
  "plus",
  "pour",
  "pourquoi",
  "preview",
  "profite",
  "propre",
  "quand",
  "que",
  "qui",
  "quoi",
  "reduction",
  "resultat",
  "resultats",
  "review",
  "revue",
  "rien",
  "sa",
  "sans",
  "se",
  "selon",
  "ses",
  "she",
  "short",
  "shorts",
  "si",
  "so",
  "solution",
  "some",
  "son",
  "sont",
  "sous",
  "subscribe",
  "sur",
  "ta",
  "teaser",
  "tes",
  "test",
  "teste",
  "tester",
  "than",
  "that",
  "the",
  "their",
  "then",
  "these",
  "they",
  "this",
  "those",
  "to",
  "toi",
  "ton",
  "too",
  "top",
  "tout",
  "toute",
  "toutes",
  "tous",
  "trailer",
  "tres",
  "trop",
  "tu",
  "tuer",
  "tuto",
  "tutoriel",
  "tutorial",
  "un",
  "une",
  "update",
  "utiliser",
  "va",
  "vas",
  "vient",
  "voici",
  "voila",
  "vont",
  "vraiment",
  "vers",
  "very",
  "versus",
  "video",
  "vos",
  "votre",
  "vous",
  "vs",
  "was",
  "watch",
  "we",
  "were",
  "what",
  "when",
  "where",
  "which",
  "who",
  "why",
  "will",
  "with",
  "without",
  "worse",
  "worst",
  "www",
  "y",
  "yes",
  "you",
  "your",
  "youtube",
]);

export type ThemeableVideo = {
  videoId: string;
  title: string;
  description?: string | null;
};

export type VideoTheme = {
  themeId: string;
  label: string;
  keywords: string[];
  videoIds: string[];
};

export type ThemeSummaryInput = {
  videoId: string;
  channelId: string;
  channelTitle: string;
  title: string;
  description?: string | null;
  thumbnailUrl: string;
  publishedAt: string;
  /** Human ×N (views ÷ channel median). */
  score: number | null;
  /** Swipe rank used to order themes and pick winners. Falls back to `score`. */
  rank?: number | null;
};

export type ThemeThumb = {
  videoId: string;
  channelId: string;
  channelTitle: string;
  title: string;
  thumbnailUrl: string;
  score: number;
  why: string;
};

export type ThemeSummaryRow = {
  themeId: string;
  label: string;
  keywords: string[];
  totalCount: number;
  scoredCount: number;
  enoughData: boolean;
  medianScore: number | null;
  winner: ThemeThumb | null;
  perChannel: ThemeThumb[];
  videoIds: string[];
};

function normalizeThemeText(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

function stripNoise(text: string): string {
  return text
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/\bwww\.\S+/gi, " ")
    .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, " ")
    .replace(/\bj['’]ai\b/gi, " ")
    .replace(/['’]/g, " ");
}

function tokenize(text: string): string[] {
  const raw = normalizeThemeText(stripNoise(text))
    .split(/[^\p{L}\p{N}.]+/u)
    .map((token) => token.replace(/^\.+|\.+$/g, ""))
    .filter(Boolean);
  const tokens: string[] = [];
  for (const token of raw) {
    if (/^\d+(\.\d+)*$/.test(token)) {
      if (tokens.length > 0) tokens[tokens.length - 1] = `${tokens[tokens.length - 1]} ${token}`;
      continue;
    }
    if (token.length < 2 || STOP.has(token)) continue;
    tokens.push(token);
  }
  return tokens;
}

/** Unique unigrams + bigrams from the title, plus the start of the description. */
export function themeTerms(title: string, description?: string | null): string[] {
  const terms = new Set<string>();
  const add = (tokens: string[]) => {
    for (const token of tokens) terms.add(token);
    for (let index = 0; index < tokens.length - 1; index += 1) {
      terms.add(`${tokens[index]} ${tokens[index + 1]}`);
    }
  };
  add(tokenize(title));
  add(tokenize((description ?? "").slice(0, DESCRIPTION_CHARS)));
  return [...terms].sort((left, right) => left.localeCompare(right));
}

function slugTheme(term: string): string {
  return normalizeThemeText(term)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function titleCaseTerm(term: string): string {
  return term
    .split(" ")
    .map((word) => (/^\d/.test(word) ? word : `${word.charAt(0).toUpperCase()}${word.slice(1)}`))
    .join(" ");
}

/** Original-cased span from `source` when accents don't shift indices; else title-case. */
function casedSpan(source: string, term: string): string | null {
  const haystack = normalizeThemeText(source);
  const at = haystack.indexOf(term);
  if (at < 0) return null;
  if (source.length === haystack.length) return source.slice(at, at + term.length);
  return titleCaseTerm(term);
}

function themeLabel(term: string, titles: readonly string[]): string {
  for (const title of titles) {
    const span = casedSpan(title, term);
    if (span) return span;
  }
  return titleCaseTerm(term);
}

function tokenCount(term: string): number {
  return term.split(" ").length;
}

type AnalyzedVideo = {
  videoId: string;
  title: string;
  titleTerms: Set<string>;
  descTerms: Set<string>;
  allTerms: Set<string>;
};

function termJaccard(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) return 0;
  let intersection = 0;
  for (const term of left) {
    if (right.has(term)) intersection += 1;
  }
  return intersection / (left.size + right.size - intersection);
}

/** Copied channel footers look the same across descriptions. */
function descriptionsAreNearDuplicates(members: readonly AnalyzedVideo[]): boolean {
  if (members.length < 2) return false;
  for (let index = 0; index < members.length; index += 1) {
    for (let other = index + 1; other < members.length; other += 1) {
      if (termJaccard(members[index]!.descTerms, members[other]!.descTerms) < 0.8) return false;
    }
  }
  return true;
}

/** Coupon leftovers like « av10 10 12 » — not versioned topics like « Cursor 2.0 ». */
function isPromoResidue(term: string): boolean {
  const standaloneInts = term.split(/\s+/).filter((token) => /^\d+$/.test(token)).length;
  if (standaloneInts >= 2) return true;
  return standaloneInts >= 1 && /[a-z]+\d+/i.test(term);
}

/**
 * Description-only terms that show up across most of the corpus — or only
 * inside near-duplicate descriptions — are channel boilerplate, not a topic.
 * Title-backed terms are never boilerplate.
 */
function isBoilerplateDescriptionTerm(
  titleDf: number,
  documentFrequency: number,
  corpusSize: number,
  members: readonly AnalyzedVideo[],
  term: string,
): boolean {
  if (titleDf > 0 || documentFrequency < 2) return false;
  if (isPromoResidue(term)) return true;
  if (corpusSize >= 3 && documentFrequency / corpusSize >= 0.7) return true;
  return descriptionsAreNearDuplicates(members);
}

/** Ranked themes the UI and `best_type` may elect — never « Autres sujets ». */
export function isWinningTheme(row: Pick<ThemeSummaryRow, "themeId" | "enoughData">): boolean {
  return row.themeId !== OTHER_THEME_ID && row.enoughData;
}

export function winningThemeRows(rows: readonly ThemeSummaryRow[]): ThemeSummaryRow[] {
  return rows.filter(isWinningTheme);
}

export function visibleThemeRows(rows: readonly ThemeSummaryRow[], count: number): ThemeSummaryRow[] {
  return rows.filter((row) => row.themeId !== OTHER_THEME_ID).slice(0, Math.max(0, count));
}

export function themeRowForVideo(rows: readonly ThemeSummaryRow[], videoId: string): ThemeSummaryRow | null {
  return rows.find((row) => row.videoIds.includes(videoId)) ?? null;
}

/**
 * Themes are topics shared by ≥2 videos in the title or the description.
 * Channel-footer boilerplate is dropped by corpus frequency (and near-duplicate
 * descriptions). Each video is assigned to the most specific remaining theme.
 * Leftovers become « Autres sujets » — a filter bucket, never a winning theme.
 */
export function clusterVideoThemes(videos: readonly ThemeableVideo[]): VideoTheme[] {
  const analyzed: AnalyzedVideo[] = videos.map((video) => {
    const titleTerms = new Set(themeTerms(video.title));
    const descTerms = new Set(themeTerms("", video.description));
    return {
      videoId: video.videoId,
      title: video.title,
      titleTerms,
      descTerms,
      allTerms: new Set([...titleTerms, ...descTerms]),
    };
  });

  const titleDf = new Map<string, string[]>();
  const allDf = new Map<string, string[]>();
  for (const video of analyzed) {
    for (const term of video.titleTerms) {
      const list = titleDf.get(term) ?? [];
      list.push(video.videoId);
      titleDf.set(term, list);
    }
    for (const term of video.allTerms) {
      const list = allDf.get(term) ?? [];
      list.push(video.videoId);
      allDf.set(term, list);
    }
  }

  const boilerplate = new Set<string>();
  for (const [term, ids] of allDf) {
    const members = analyzed.filter((video) => ids.includes(video.videoId));
    if (isBoilerplateDescriptionTerm(titleDf.get(term)?.length ?? 0, ids.length, videos.length, members, term)) {
      boilerplate.add(term);
    }
  }

  const topicTerms = [...allDf.keys()].filter((term) => !boilerplate.has(term));
  const candidates = topicTerms
    .map((term) => ({
      term,
      videoIds: (allDf.get(term) ?? []).slice().sort((left, right) => left.localeCompare(right)),
    }))
    .filter((candidate) => candidate.videoIds.length >= 2)
    .filter((candidate) => {
      return !topicTerms.some((other) => {
        if (other === candidate.term) return false;
        if (tokenCount(other) <= tokenCount(candidate.term)) return false;
        if (!other.includes(candidate.term)) return false;
        const otherIds = allDf.get(other) ?? [];
        const overlap = candidate.videoIds.filter((id) => otherIds.includes(id)).length;
        return overlap / candidate.videoIds.length >= 0.7;
      });
    })
    .sort((left, right) => {
      if (tokenCount(right.term) !== tokenCount(left.term)) return tokenCount(right.term) - tokenCount(left.term);
      if (right.videoIds.length !== left.videoIds.length) return right.videoIds.length - left.videoIds.length;
      return left.term.localeCompare(right.term);
    });

  const remaining = new Set(videos.map((video) => video.videoId));
  const themes: VideoTheme[] = [];
  for (const candidate of candidates) {
    const members = candidate.videoIds.filter((id) => remaining.has(id));
    if (members.length < 2) continue;
    const titles = analyzed.filter((video) => members.includes(video.videoId)).map((video) => video.title);
    const themeId = slugTheme(candidate.term);
    if (!themeId || themeId === OTHER_THEME_ID) continue;
    themes.push({
      themeId,
      label: themeLabel(candidate.term, titles),
      keywords: [candidate.term],
      videoIds: members.sort((left, right) => left.localeCompare(right)),
    });
    for (const id of members) remaining.delete(id);
  }

  const leftover = [...remaining].sort((left, right) => left.localeCompare(right));
  if (leftover.length > 0) {
    themes.push({ themeId: OTHER_THEME_ID, label: OTHER_THEME_LABEL, keywords: [], videoIds: leftover });
  }
  return themes;
}

function formatScore(score: number): string {
  return `×${score.toFixed(1).replace(".", ",")}`;
}

function recencyPart(ageDays: number): string {
  if (ageDays < 7) return "récente (<7 j)";
  if (ageDays < 45) return `${Math.round(ageDays)} j`;
  if (ageDays < 365) return `${Math.round(ageDays / 30)} mois`;
  const years = Math.round(ageDays / 365);
  return years <= 1 ? "1 an" : `${years} ans`;
}

const TITLE_HOOK_MAX = 72;

function clipTitle(title: string): string {
  const compact = title.replace(/\s+/g, " ").trim();
  if (compact.length <= TITLE_HOOK_MAX) return compact;
  return `${compact.slice(0, TITLE_HOOK_MAX - 1).trimEnd()}…`;
}

function titleHook(title: string, keywords: readonly string[]): string | null {
  for (const keyword of keywords) {
    const span = casedSpan(title, keyword);
    if (span) return span;
  }
  const clipped = clipTitle(title);
  return clipped || null;
}

/** Factual swipe why: ×N vs the channel median, age, title span that names the theme. */
export function themeWhy(input: {
  score: number | null;
  ageDays: number;
  title: string;
  keywords: readonly string[];
}): string {
  const parts: string[] = [];
  if (input.score !== null) parts.push(`${formatScore(input.score)} vs médiane`);
  parts.push(recencyPart(input.ageDays));
  const hook = titleHook(input.title, input.keywords);
  if (hook) parts.push(`titre: ${hook}`);
  return parts.join(" · ");
}

function rankingValue(video: ThemeSummaryInput): number | null {
  if (video.rank !== undefined) return video.rank;
  return video.score;
}

function toThumb(video: ThemeSummaryInput, keywords: readonly string[], now: Date): ThemeThumb {
  return {
    videoId: video.videoId,
    channelId: video.channelId,
    channelTitle: video.channelTitle,
    title: video.title,
    thumbnailUrl: video.thumbnailUrl,
    score: video.score ?? 0,
    why: themeWhy({
      score: video.score,
      ageDays: ageInDays(video.publishedAt, now),
      title: video.title,
      keywords,
    }),
  };
}

function bestPerChannel(ranked: ThemeSummaryInput[], keywords: readonly string[], now: Date): ThemeThumb[] {
  const best = new Map<string, ThemeSummaryInput>();
  for (const video of ranked) {
    const current = best.get(video.channelId);
    if (!current || (rankingValue(video) ?? 0) > (rankingValue(current) ?? 0)) best.set(video.channelId, video);
  }
  return [...best.values()]
    .sort((left, right) => {
      const byRank = (rankingValue(right) ?? 0) - (rankingValue(left) ?? 0);
      if (byRank !== 0) return byRank;
      return left.channelTitle.localeCompare(right.channelTitle) || left.videoId.localeCompare(right.videoId);
    })
    .map((video) => toThumb(video, keywords, now));
}

/**
 * One row per theme. Themes with ≥3 scored videos are ordered by median swipe
 * rank (same key as YouTube search). The displayed median stays the human ×N.
 */
export function summarizeThemes(videos: readonly ThemeSummaryInput[], now: Date = new Date()): ThemeSummaryRow[] {
  const byId = new Map(videos.map((video) => [video.videoId, video]));
  const rows: Array<ThemeSummaryRow & { medianRank: number | null }> = [];

  for (const theme of clusterVideoThemes(videos)) {
    const members = theme.videoIds.flatMap((id) => {
      const video = byId.get(id);
      return video ? [video] : [];
    });
    const ranked = members.filter((video): video is ThemeSummaryInput & { score: number } => {
      return rankingValue(video) !== null && video.score !== null;
    });
    const enoughData = theme.themeId !== OTHER_THEME_ID && ranked.length >= MIN_SCORED_FOR_RANKING;
    const best = enoughData
      ? ranked.reduce((top, video) => ((rankingValue(video) ?? 0) > (rankingValue(top) ?? 0) ? video : top))
      : null;
    const middle = enoughData ? median(ranked.map((video) => video.score)) : null;
    const middleRank = enoughData ? median(ranked.map((video) => rankingValue(video) ?? 0)) : null;
    rows.push({
      themeId: theme.themeId,
      label: theme.label,
      keywords: theme.keywords,
      totalCount: members.length,
      scoredCount: ranked.length,
      enoughData,
      medianScore: middle === null ? null : Math.round(middle * 10) / 10,
      medianRank: middleRank,
      winner: best ? toThumb(best, theme.keywords, now) : null,
      perChannel: ranked.length > 0 ? bestPerChannel(ranked, theme.keywords, now) : [],
      videoIds: [...theme.videoIds],
    });
  }

  return rows
    .sort((left, right) => {
      if (left.enoughData !== right.enoughData) return left.enoughData ? -1 : 1;
      if (left.enoughData) return (right.medianRank ?? 0) - (left.medianRank ?? 0) || right.scoredCount - left.scoredCount;
      return right.totalCount - left.totalCount || left.label.localeCompare(right.label);
    })
    .map(({ medianRank: _medianRank, ...row }) => row);
}
