import { SWIPE_RERANK_TOP } from "@/lib/youtube/swipe-rank";
import { OTHER_FORMAT_ID, VIDEO_FORMATS, isVideoFormat, type VideoFormatId } from "@/lib/youtube/video-formats";
import type { VelocityKind } from "@/lib/youtube/working-subject";
import { evaluateNouls, evaluateSystemOne, typesafeApiKey, type ChoiceQuestion, type ScoreQuestion } from "./client";

export type TitleCandidate = { videoId: string; title: string };
export type JevClickKind = "search" | "followed";

function clickInstructions(query: string, titleKey: string, kind: JevClickKind): string {
  const situation =
    kind === "followed"
      ? `These titles are from followed YouTube channel(s): ${query}.`
      : `The user searched YouTube for: ${query}.`;
  return `${situation} Does titles.${titleKey} make a viewer want to click the video? Judge title packaging only, not truth or quality.`;
}

/**
 * TypeSafe Jev judges title click-appeal only (text, no pixels, no arithmetic).
 * Missing key or a failed call → empty map; the numeric rank stays as-is.
 */
export async function jevClickNouls(
  query: string,
  videos: readonly TitleCandidate[],
  kind: JevClickKind = "search",
): Promise<Map<string, number>> {
  const apiKey = typesafeApiKey();
  const shortlist = videos.slice(0, SWIPE_RERANK_TOP);
  if (!apiKey || shortlist.length === 0) return new Map();

  const titles: Record<string, string> = {};
  const questions: Record<string, { type: "noul"; instructions: string }> = {};
  shortlist.forEach((video, index) => {
    const key = `click_${index}`;
    titles[key] = video.title;
    questions[key] = {
      type: "noul",
      instructions: clickInstructions(query, key, kind),
    };
  });

  try {
    const nouls = await evaluateNouls(apiKey, { query, titles }, questions);
    const byVideo = new Map<string, number>();
    shortlist.forEach((video, index) => {
      const noul = nouls[`click_${index}`];
      if (typeof noul === "number") byVideo.set(video.videoId, noul);
    });
    return byVideo;
  } catch {
    return new Map();
  }
}

export type TrendJudgmentInput = {
  videoId: string;
  title: string;
  description?: string | null;
  durationSeconds: number;
  overperformance: number | null;
  viewsPerHour: number;
  velocityKind: VelocityKind;
};

export type TrendJudgment = { formatId: VideoFormatId; note: number; score01: number };

export const TREND_SCORE_CRITERIA = [
  "Weak swipe package: vague or generic title, no reason a creator would save it.",
  "Ordinary package: clear topic but unremarkable packaging.",
  "Solid swipe candidate: title and hook would earn a save from a creator studying thumbnails.",
  "Strong swipe hit: timely, specific packaging given the already-computed overperformance.",
  "Exceptional package: a creator would steal this pattern immediately.",
] as const;

const FORMAT_CHOICE_CRITERIA: Record<string, string> = {
  ...Object.fromEntries(VIDEO_FORMATS.map((format) => [format.id, format.label])),
  [OTHER_FORMAT_ID]: "None of the named formats fit.",
};

function formatChoiceQuestion(index: number): ChoiceQuestion {
  return {
    type: "choice",
    instructions: `Which closed YouTube format is videos.v${index}? Use title, description, and durationSeconds only. Pick other when nothing fits.`,
    criteria: FORMAT_CHOICE_CRITERIA,
  };
}

function packageScoreQuestion(index: number): ScoreQuestion {
  return {
    type: "score",
    instructions: `How strong is videos.v${index} as a swipe-file thumbnail package? videos.v${index}.overperformance and videos.v${index}.viewsPerHour are already computed by code — do not recalculate views, ×N, or velocity. Judge title and description packaging only.`,
    criteria: TREND_SCORE_CRITERIA,
  };
}

function noteFromScore(score: number): { note: number; score01: number } {
  const clamped = Math.min(4, Math.max(0, score));
  return { note: Math.round((clamped / 4) * 10 * 10) / 10, score01: clamped / 4 };
}

/**
 * TypeSafe Choice (format) + Score (package note) for the already-ranked 7-day pool.
 * Code owns ×N / velocity. Missing key / failure → empty map.
 */
export async function jevTrendJudgments(videos: readonly TrendJudgmentInput[]): Promise<Map<string, TrendJudgment>> {
  const apiKey = typesafeApiKey();
  const shortlist = videos.slice(0, SWIPE_RERANK_TOP);
  if (!apiKey || shortlist.length === 0) return new Map();

  const stateVideos: Record<string, Omit<TrendJudgmentInput, "videoId">> = {};
  const questions: Record<string, ChoiceQuestion | ScoreQuestion> = {};
  shortlist.forEach((video, index) => {
    stateVideos[`v${index}`] = {
      title: video.title,
      description: video.description ?? "",
      durationSeconds: video.durationSeconds,
      overperformance: video.overperformance,
      viewsPerHour: video.viewsPerHour,
      velocityKind: video.velocityKind,
    };
    questions[`fmt_${index}`] = formatChoiceQuestion(index);
    questions[`note_${index}`] = packageScoreQuestion(index);
  });

  try {
    const answers = await evaluateSystemOne(apiKey, { videos: stateVideos }, questions);
    const byVideo = new Map<string, TrendJudgment>();
    shortlist.forEach((video, index) => {
      const choice = answers[`fmt_${index}`];
      const scored = answers[`note_${index}`];
      if (scored?.type !== "score") return;
      const formatId =
        choice?.type === "choice" && isVideoFormat(choice.choice) ? choice.choice : OTHER_FORMAT_ID;
      const { note, score01 } = noteFromScore(scored.score);
      byVideo.set(video.videoId, { formatId, note, score01 });
    });
    return byVideo;
  } catch {
    return new Map();
  }
}
