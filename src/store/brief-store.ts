import { create } from "zustand";
import type { BriefPatchInput } from "@/lib/brief/merge";
import type { BriefIssue, ThumbnailBrief } from "@/lib/brief/schema";
import type { BriefUpdatedData } from "@/lib/brief/brief-updated";

/**
 * The open conversation's thumbnail brief on the client (« Fiche » badge and
 * sheet, live step line). Reads and edits go through /api/briefs/… (free,
 * local); the agent's writes arrive as `data-brief-updated` chunks.
 */

export type BriefPatchOutcome = { ok: true; warnings: string[] } | { ok: false; error: string; issues: BriefIssue[] };

type BriefState = {
  conversationId: string | null;
  brief: ThumbnailBrief | null;
  updatedAt: string | null;
  load: (conversationId: string | null) => Promise<void>;
  onBriefUpdated: (data: BriefUpdatedData) => void;
  patch: (body: BriefPatchInput) => Promise<BriefPatchOutcome>;
};

// Only the latest request may write: an older answer never overwrites a newer one.
let requestSeq = 0;

const briefUrl = (conversationId: string) => `/api/briefs/${encodeURIComponent(conversationId)}`;

export const useBriefStore = create<BriefState>((set, get) => ({
  conversationId: null,
  brief: null,
  updatedAt: null,

  load: async (conversationId) => {
    const seq = ++requestSeq;
    if (get().conversationId !== conversationId) set({ conversationId, brief: null, updatedAt: null });
    if (!conversationId) return;
    try {
      const res = await fetch(briefUrl(conversationId));
      if (seq !== requestSeq || get().conversationId !== conversationId) return;
      if (!res.ok) {
        set({ brief: null, updatedAt: null });
        return;
      }
      const body = (await res.json()) as { brief: ThumbnailBrief | null; updatedAt: string | null };
      if (seq !== requestSeq || get().conversationId !== conversationId) return;
      set({ brief: body.brief, updatedAt: body.updatedAt });
    } catch {
      // Keep what is shown; the next update or opening loads again.
    }
  },

  onBriefUpdated: (data) => {
    const state = get();
    if (state.conversationId !== data.conversationId) return;
    if (state.brief) set({ brief: { ...state.brief, step: data.step } });
    void state.load(data.conversationId);
  },

  patch: async (body) => {
    const conversationId = get().conversationId;
    if (!conversationId) return { ok: false, error: "Aucune conversation ouverte", issues: [] };
    let res: Response;
    try {
      res = await fetch(briefUrl(conversationId), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      return { ok: false, error: "Enregistrement impossible, réessaie", issues: [] };
    }
    const payload = (await res.json().catch(() => ({}))) as {
      brief?: ThumbnailBrief;
      updatedAt?: string;
      warnings?: string[];
      error?: string;
      issues?: BriefIssue[];
    };
    if (!res.ok || !payload.brief) {
      return { ok: false, error: payload.error ?? "Enregistrement impossible, réessaie", issues: payload.issues ?? [] };
    }
    requestSeq++;
    if (get().conversationId === conversationId) set({ brief: payload.brief, updatedAt: payload.updatedAt ?? null });
    return { ok: true, warnings: payload.warnings ?? [] };
  },
}));

/** Tests only. */
export function resetBriefStore(): void {
  requestSeq++;
  useBriefStore.setState({ conversationId: null, brief: null, updatedAt: null });
}
