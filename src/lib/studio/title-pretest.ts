import { getStudioVideo } from "@/lib/studio/store";
import type { TitleVariant } from "@/lib/studio/types";
import { typesafeApiKey } from "@/lib/typesafe/client";
import { jevClickNouls, type TitleCandidate } from "@/lib/typesafe/rerank-titles";

export type PretestedTitleVariant = TitleVariant & {
  score: number | null;
  reason: string;
};

const MISSING_KEY_REASON = "Ajoute TypeSafe dans Réglages → Connexions pour un pré-test Jev";

export async function rankStudioTitles(titles: readonly TitleCandidate[]): Promise<Map<string, number>> {
  return jevClickNouls("studio-pretest", titles, "followed");
}

export async function pretestTitleVariants(videoId: string): Promise<PretestedTitleVariant[]> {
  const video = getStudioVideo(videoId);
  if (!video) throw new Error("Fiche vidéo introuvable.");

  if (!typesafeApiKey()) {
    return video.draft.titleVariants.map((row) => ({
      ...row,
      score: null,
      reason: MISSING_KEY_REASON,
    }));
  }

  const ranked = await rankStudioTitles(
    video.draft.titleVariants.map((row, index) => ({
      videoId: `row_${index}`,
      title: row.title,
    })),
  );

  return video.draft.titleVariants.map((row, index) => {
    const score = ranked.get(`row_${index}`) ?? null;
    return {
      ...row,
      score,
      reason: score === null ? "Jev n’a pas noté cette ligne" : "",
    };
  });
}
