import type { StudioDraftPatch } from "@/lib/studio/draft-patch";
import { writingProjectId, type StudioVideo } from "@/lib/studio/types";

export function studioDraftPatchFromVideos(
  before: StudioVideo | null,
  after: StudioVideo,
): StudioDraftPatch {
  return {
    videoId: after.videoId,
    projectId: writingProjectId(after.videoId),
    updatedAt: after.updatedAt,
    previousUpdatedAt: before?.updatedAt ?? after.updatedAt,
    title: after.title,
    summary: after.summary,
    script: after.draft.script,
    description: after.draft.description,
    titleVariants: after.draft.titleVariants,
    phase: "filling",
  };
}
