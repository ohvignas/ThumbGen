import { create } from "zustand";

type State = {
  abandonRequest: string | null;
  requestAbandon: (videoId: string) => void;
  clearAbandon: () => void;
};

export const useStudioCreateStore = create<State>((set) => ({
  abandonRequest: null,
  requestAbandon: (videoId) => set({ abandonRequest: videoId }),
  clearAbandon: () => set({ abandonRequest: null }),
}));
