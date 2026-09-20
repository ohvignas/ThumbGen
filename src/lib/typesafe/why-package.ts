import { holdBandFromNoul, isWhyCategory, OTHER_WHY_CATEGORY, WHY_CATEGORIES, type WhyCategoryId } from "@/lib/youtube/why-categories";
import type { CaptionKind, WhyJev } from "@/lib/youtube/types";
import { evaluateSystemOne, typesafeApiKey, type ChoiceQuestion, type NoulQuestion, type ScoreQuestion } from "./client";

export const WHY_CLICK_SCORE_CRITERIA = [
  "The title and spoken opening give almost no reason to click or stay.",
  "A clear topic, but the package is generic; a viewer could skip it.",
  "A competent package: specific title and an opening that matches the promise.",
  "A strong package: title creates a click reason and the first 30s would hold a typical viewer.",
  "An exceptional swipe-file package: title plus hook would be stolen immediately. Do not treat overperformance as proof.",
] as const;

export type WhyPackageState = {
  title: string;
  descriptionExcerpt: string;
  hookText: string;
  hookQuotes: string[];
  captionKind: CaptionKind | null;
  language: string | null;
  overperformance: number | null;
  performanceKind: "scored" | "recent" | "none";
  viewsPerHour: number | null;
  velocityKind: "delta" | "average" | null;
};

const unused = (): WhyJev => ({
  used: false,
  note: null,
  holdNoul: null,
  holdBand: null,
  categoryId: null,
  confidence: null,
});

function noteFromScore(score: number): number {
  const clamped = Math.min(4, Math.max(0, score));
  return Math.round((clamped / 4) * 10 * 10) / 10;
}

function categoryCriteria(): Record<string, string> {
  return Object.fromEntries(WHY_CATEGORIES.map((item) => [item.id, item.label]));
}

export async function jevWhyPackage(input: WhyPackageState, signal?: AbortSignal): Promise<WhyJev> {
  const apiKey = typesafeApiKey();
  if (!apiKey) return unused();

  const click: ScoreQuestion = {
    type: "score",
    instructions:
      "How strong is package.title plus package.hookText as a reason to click and open the video? package.overperformance and package.viewsPerHour are already computed by code — do not redo view math or treat ×N as proof. Judge packaging only. If hookText is empty, judge the title and descriptionExcerpt only.",
    criteria: WHY_CLICK_SCORE_CRITERIA,
  };
  const hold: NoulQuestion = {
    type: "noul",
    instructions:
      "Does package.hookText give a typical viewer a reason to keep watching past the first 30 seconds? If hookText is empty, the answer is no. package.overperformance is already computed — do not infer watch-time percentages.",
    criteria: {
      true: "The spoken opening creates an unfinished question, payoff, or tension that would hold a typical viewer.",
      false: "The opening is empty, generic, or finished; a typical viewer could leave.",
    },
  };
  const category: ChoiceQuestion = {
    type: "choice",
    instructions:
      "Which packaging pattern best describes why package.title plus package.hookText would earn a click? Pick other when none fit. Do not use view counts.",
    criteria: categoryCriteria(),
  };

  try {
    const answers = await evaluateSystemOne(apiKey, { package: input }, { click, hold, category }, signal);
    const scored = answers.click;
    const held = answers.hold;
    const chosen = answers.category;
    if (scored?.type !== "score") return unused();
    const holdNoul = held?.type === "noul" ? held.noul : null;
    const categoryId: WhyCategoryId | null =
      chosen?.type === "choice" && isWhyCategory(chosen.choice)
        ? chosen.choice
        : chosen?.type === "choice"
          ? OTHER_WHY_CATEGORY
          : null;
    return {
      used: true,
      note: noteFromScore(scored.score),
      holdNoul,
      holdBand: holdNoul === null ? null : holdBandFromNoul(holdNoul),
      categoryId,
      confidence: scored.confidence ?? (chosen?.type === "choice" ? chosen.confidence : null) ?? null,
    };
  } catch {
    return unused();
  }
}
