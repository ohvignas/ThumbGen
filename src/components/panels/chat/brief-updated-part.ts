import { BRIEF_UPDATED_PART, isBriefUpdatedData } from "@/lib/brief/brief-updated";
import { useBriefStore } from "@/store/brief-store";

/**
 * A `data-brief-updated` part received by the chat (update_brief, chantier F3):
 * the open conversation's badge and step line move at once, and the brief is
 * read again. Never sends anything to the agent.
 */
export function applyBriefUpdatedPart(part: { type: string; data?: unknown }): boolean {
  if (part.type !== BRIEF_UPDATED_PART || !isBriefUpdatedData(part.data)) return false;
  useBriefStore.getState().onBriefUpdated(part.data);
  return true;
}
