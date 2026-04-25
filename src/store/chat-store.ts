import { create } from "zustand";

export type ChatAttachment = { source: string; preview_url: string };

type ChatState = {
  isOpen: boolean;
  activeConversationId: string | null;
  draft: string;
  attachments: ChatAttachment[];

  open: () => void;
  close: () => void;
  toggle: () => void;
  setActive: (id: string | null) => void;
  setDraft: (s: string) => void;
  addAttachment: (a: ChatAttachment) => void;
  removeAttachment: (source: string) => void;
  clearAttachments: () => void;
  reset: () => void;
};

export const useChatStore = create<ChatState>((set) => ({
  // The chat panel is always visible (right side). isOpen is kept for back-compat
  // but defaults to true and toggle/close are effectively no-ops.
  isOpen: true,
  activeConversationId: null,
  draft: "",
  attachments: [],

  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  toggle: () => set((s) => ({ isOpen: !s.isOpen })),

  /** Switching conversation clears draft & attachments to avoid bleed-over. */
  setActive: (id) => set({ activeConversationId: id, draft: "", attachments: [] }),

  setDraft: (draft) => set({ draft }),

  addAttachment: (a) =>
    set((s) => (s.attachments.some((x) => x.source === a.source) ? s : { attachments: [...s.attachments, a] })),

  removeAttachment: (source) =>
    set((s) => ({ attachments: s.attachments.filter((x) => x.source !== source) })),

  clearAttachments: () => set({ attachments: [] }),

  reset: () =>
    set({ isOpen: true, activeConversationId: null, draft: "", attachments: [] }),
}));
