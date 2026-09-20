/**
 * Shared “best thumbnail” rank: views vs channel typical reach, then
 * log-compress, recency, and view-credibility. Arithmetic stays in code
 * (TypeSafe Jev is not a calculator — it only nudges titles afterwards).
 */

export const SWIPE_SCORE_CAP = 20;
export const SWIPE_HALF_LIFE_DAYS = 90;
export const SWIPE_CRED_VIEWS = 20_000;
export const SWIPE_SUB_PRIOR = 0.25;
export const SWIPE_MIN_SUBS = 1_000;
export const SWIPE_MIN_SAMPLE = 8;
export const SWIPE_MIN_MEDIAN_VIEWS = 500;
export const SWIPE_RERANK_TOP = 20;
export const YOUTUBE_SEARCH_MIN_CHARS = 3;
export const YOUTUBE_SEARCH_MAX_RESULTS = 25;
export const YOUTUBE_SEARCH_MAX_QUERY = 100;

export type SwipeRankInput = {
  score: number | null;
  ageDays: number;
  viewCount: number;
  searchRank?: number;
};

/** Channel median when the sample is solid; else ~¼ of subscribers. */
export function swipeBaseline(input: {
  medianViews: number | null;
  sampleCount: number;
  subscriberCount: number | null;
}): number | null {
  if (input.sampleCount >= SWIPE_MIN_SAMPLE && input.medianViews !== null && input.medianViews >= SWIPE_MIN_MEDIAN_VIEWS) {
    return input.medianViews;
  }
  if (input.subscriberCount !== null && input.subscriberCount >= SWIPE_MIN_SUBS) {
    return SWIPE_SUB_PRIOR * input.subscriberCount;
  }
  return null;
}

export function swipeRankKey(input: SwipeRankInput): number | null {
  if (input.score === null || input.score <= 0) return null;
  const capped = Math.min(input.score, SWIPE_SCORE_CAP);
  const fresh = 1 / (1 + input.ageDays / SWIPE_HALF_LIFE_DAYS);
  const cred = input.viewCount / (input.viewCount + SWIPE_CRED_VIEWS);
  const pertinence = input.searchRank === undefined || input.searchRank < 10 ? 1 : 0.8;
  return Math.log2(Math.max(capped, 1e-9)) * fresh * cred * pertinence;
}

export function compareSwipeRank(left: number | null, right: number | null): number {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return right - left;
}

/** Blend numeric rank with a TypeSafe click-appeal noul in [0, 1]. */
export function applyJevNudge(rank: number | null, noul: number | undefined): number | null {
  if (rank === null) return null;
  if (noul === undefined || !Number.isFinite(noul)) return rank;
  const clamped = Math.min(1, Math.max(0, noul));
  return rank * (0.55 + 0.45 * clamped);
}
