import { describe, expect, it } from "vitest";
import { emptyStudioDraft } from "@/lib/studio/page-template";
import { writingProjectId, type StudioVideo } from "@/lib/studio/types";
import { studioDraftPatchFromVideos } from "@/lib/agent/v2/studio-draft-broadcast";

describe("studio draft broadcast", () => {
  it("builds a filling patch from the row after upsert", () => {
    const created: StudioVideo = {
      videoId: "vid_openclaw",
      title: "Sans titre",
      summary: "",
      youtubeUrl: null,
      youtubeVideoId: null,
      etiquette: null,
      createdAt: "2026-09-20T10:00:00.000Z",
      updatedAt: "2026-09-20T10:00:00.000Z",
      draft: emptyStudioDraft(),
    };
    const after = { ...created, title: "OpenClaw est mort", updatedAt: "2026-09-20T10:00:01.000Z" };
    const patch = studioDraftPatchFromVideos(created, after);
    expect(patch.phase).toBe("filling");
    expect(patch.projectId).toBe(writingProjectId(after.videoId));
    expect(patch.previousUpdatedAt).toBe(created.updatedAt);
    expect(patch.title).toBe("OpenClaw est mort");
  });
});
