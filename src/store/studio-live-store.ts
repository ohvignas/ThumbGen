import { create } from "zustand";
import { advanceStudioPhase, type StudioAgentPhase } from "@/lib/studio/agent-phase";
import {
  shouldApplyStudioDraftPatch,
  type StudioDraftPatch,
} from "@/lib/studio/draft-patch";

type State = {
  phase: StudioAgentPhase;
  lastPatch: StudioDraftPatch | null;
  knownUpdatedAt: string | null;
  noteTool: (name: string) => void;
  applyPatch: (patch: StudioDraftPatch) => void;
  reset: () => void;
};

export const useStudioLiveStore = create<State>((set, get) => ({
  phase: "listening",
  lastPatch: null,
  knownUpdatedAt: null,
  noteTool: (name) => set({ phase: advanceStudioPhase(get().phase, name) }),
  applyPatch: (patch) => {
    const state = get();
    if (
      !shouldApplyStudioDraftPatch(patch, {
        openVideoId: patch.videoId,
        knownUpdatedAt: state.knownUpdatedAt,
      })
    ) {
      return;
    }
    set({
      lastPatch: patch,
      knownUpdatedAt: patch.updatedAt,
      phase: advanceStudioPhase(state.phase, "upsert_studio_script"),
    });
  },
  reset: () => set({ phase: "listening", lastPatch: null, knownUpdatedAt: null }),
}));
