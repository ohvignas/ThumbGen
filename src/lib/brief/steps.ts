import { BRIEF_TOTAL_STEPS } from "./schema";

/** The thumbnail journey's steps as the chat names them (« Étape 3/7 — Concurrents »). Pure. */
export const BRIEF_STEP_NAMES: Record<number, string> = {
  1: "Vidéo et promesse",
  2: "Recherche et logos",
  3: "Concurrents",
  4: "Stratégie et directions",
  5: "Éléments communs",
  6: "Cartes de composition",
  7: "Esquisses et workflow",
};

export function briefStepBadge(step: number): string {
  return `Étape ${step}/${BRIEF_TOTAL_STEPS}`;
}

export function briefStepLine(step: number): string {
  const name = BRIEF_STEP_NAMES[step];
  return name ? `${briefStepBadge(step)} — ${name}` : briefStepBadge(step);
}
