/**
 * The transient chunk update_brief writes into the chat stream after a brief
 * write: the Fiche sheet reloads from it. Pure and client-safe.
 */
export const BRIEF_UPDATED_PART = "data-brief-updated" as const;

export type BriefUpdatedData = { conversationId: string; step: number; updatedAt: string };

export function isBriefUpdatedData(value: unknown): value is BriefUpdatedData {
  if (!value || typeof value !== "object") return false;
  const data = value as Record<string, unknown>;
  return typeof data.conversationId === "string" && typeof data.step === "number" && typeof data.updatedAt === "string";
}
