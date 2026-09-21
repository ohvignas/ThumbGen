import { describe, it, expect } from "vitest";
import { emptyStudioDraft } from "@/lib/studio/page-template";
import {
  STUDIO_DRAFT_PATCH_PART,
  isStudioDraftPatch,
  shouldApplyStudioDraftPatch,
  type StudioDraftPatch,
} from "@/lib/studio/draft-patch";

const patch: StudioDraftPatch = {
  videoId: "vid_abc",
  projectId: "studio:vid_abc",
  updatedAt: "2026-09-20T10:00:01.000Z",
  previousUpdatedAt: "2026-09-20T10:00:00.000Z",
  title: "OpenClaw est mort",
  summary: "",
  script: "## 1. Introduction\nHook.",
  description: "",
  titleVariants: emptyStudioDraft().titleVariants,
  phase: "filling",
};

describe("studio draft patch", () => {
  it("accepts a newer patch for the open video and ignores replays", () => {
    expect(STUDIO_DRAFT_PATCH_PART).toBe("data-studio-draft-patch");
    expect(isStudioDraftPatch(patch)).toBe(true);
    expect(isStudioDraftPatch({ videoId: "x" })).toBe(false);
    expect(
      shouldApplyStudioDraftPatch(patch, { openVideoId: "vid_abc", knownUpdatedAt: "2026-09-20T10:00:00.000Z" }),
    ).toBe(true);
    expect(
      shouldApplyStudioDraftPatch(patch, { openVideoId: "vid_abc", knownUpdatedAt: "2026-09-20T10:00:01.000Z" }),
    ).toBe(false);
    expect(
      shouldApplyStudioDraftPatch(patch, { openVideoId: "vid_other", knownUpdatedAt: null }),
    ).toBe(false);
  });

  it("rejects malformed draft patch payloads", () => {
    const { summary: _s, ...noSummary } = patch;
    expect(isStudioDraftPatch(noSummary)).toBe(false);
    expect(isStudioDraftPatch({ ...patch, summary: 42 })).toBe(false);
    expect(isStudioDraftPatch({ ...patch, titleVariants: [] })).toBe(false);
    expect(isStudioDraftPatch({ ...patch, titleVariants: patch.titleVariants.slice(0, 2) })).toBe(false);
    const [a, b, c] = patch.titleVariants;
    expect(
      isStudioDraftPatch({
        ...patch,
        titleVariants: [{ ...a, thumbText: undefined }, b, c],
      }),
    ).toBe(false);
  });
});
