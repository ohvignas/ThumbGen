import { UNTITLED_STUDIO_VIDEO, type StudioDraft, type StudioVideo } from "./types";

export function isEmptyStudioDraft(draft: StudioDraft): boolean {
  return (
    draft.script.trim() === "" &&
    draft.description.trim() === "" &&
    draft.titleVariants.every(
      (row) => row.title.trim() === "" && row.thumbText.trim() === "" && row.visualConcept.trim() === "",
    )
  );
}

export function isStudioDraftVisible(
  video: Pick<StudioVideo, "title" | "summary" | "draft" | "youtubeUrl">,
): boolean {
  if (video.youtubeUrl) return true;
  if (video.summary.trim()) return true;
  if (!isEmptyStudioDraft(video.draft)) return true;
  const title = video.title.trim();
  return title.length > 0 && title !== UNTITLED_STUDIO_VIDEO;
}
