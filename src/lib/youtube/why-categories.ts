export const WHY_CATEGORIES = [
  { id: "curiosity_gap", label: "Écart de curiosité" },
  { id: "specific_payoff", label: "Résultat concret" },
  { id: "identity_challenge", label: "Tu fais ça mal" },
  { id: "story_open", label: "Ouverture récit" },
  { id: "listicle", label: "Liste / top" },
  { id: "news_timely", label: "Actu / timing" },
  { id: "other", label: "Autre accroche" },
] as const;

export type WhyCategoryId = (typeof WHY_CATEGORIES)[number]["id"];
export const WHY_CATEGORY_IDS = WHY_CATEGORIES.map((item) => item.id) as [WhyCategoryId, ...WhyCategoryId[]];
export const OTHER_WHY_CATEGORY = "other" as const;

export type WhyHoldBand = "holds" | "unsure" | "drops";

export function isWhyCategory(value: unknown): value is WhyCategoryId {
  return typeof value === "string" && (WHY_CATEGORY_IDS as readonly string[]).includes(value);
}

export function whyCategoryLabel(id: string | null | undefined): string {
  return WHY_CATEGORIES.find((item) => item.id === id)?.label ?? "Autre accroche";
}

/** Noul is P(yes), not intensity. Near 0.5 = unsure, not “medium hold”. */
export function holdBandFromNoul(noul: number): WhyHoldBand {
  if (noul >= 0.65) return "holds";
  if (noul <= 0.35) return "drops";
  return "unsure";
}
