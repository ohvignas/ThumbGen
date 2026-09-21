import { beforeEach, describe, expect, it } from "vitest";
import { emptyStudioDraft } from "@/lib/studio/page-template";
import { useStudioLiveStore } from "@/store/studio-live-store";

describe("studio live store", () => {
  beforeEach(() => {
    useStudioLiveStore.getState().reset();
  });

  it("keeps the newest patch for a video and advances phase", () => {
    useStudioLiveStore.getState().noteTool("retrieve_own_corpus");
    expect(useStudioLiveStore.getState().phase).toBe("researching");
    useStudioLiveStore.getState().applyPatch({
      videoId: "vid_abc",
      projectId: "studio:vid_abc",
      updatedAt: "2026-09-20T10:00:01.000Z",
      previousUpdatedAt: "2026-09-20T10:00:00.000Z",
      title: "OpenClaw",
      summary: "",
      script: "Hook",
      description: "",
      titleVariants: emptyStudioDraft().titleVariants,
      phase: "filling",
    });
    expect(useStudioLiveStore.getState().phase).toBe("filling");
    expect(useStudioLiveStore.getState().lastPatch?.script).toBe("Hook");
  });
});
