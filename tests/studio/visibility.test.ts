import { describe, it, expect } from "vitest";
import { emptyStudioDraft } from "@/lib/studio/page-template";
import { UNTITLED_STUDIO_VIDEO } from "@/lib/studio/types";
import { isEmptyStudioDraft, isStudioDraftVisible } from "@/lib/studio/visibility";

function video(overrides: Partial<Parameters<typeof isStudioDraftVisible>[0]> = {}) {
  return {
    title: UNTITLED_STUDIO_VIDEO,
    summary: "",
    youtubeUrl: null,
    draft: emptyStudioDraft(),
    ...overrides,
  };
}

describe("studio draft visibility", () => {
  it("hides a freshly created Sans titre fiche", () => {
    expect(isEmptyStudioDraft(emptyStudioDraft())).toBe(true);
    expect(isStudioDraftVisible(video())).toBe(false);
  });

  it("shows a fiche once the title, notes, draft or URL exists", () => {
    expect(isStudioDraftVisible(video({ title: "OpenClaw est mort" }))).toBe(true);
    expect(isStudioDraftVisible(video({ summary: "Angle équipe AI" }))).toBe(true);
    expect(isStudioDraftVisible(video({ youtubeUrl: "https://youtu.be/abcdefghijk" }))).toBe(true);
    const draft = emptyStudioDraft();
    draft.script = "## 1. Introduction\nHook.";
    expect(isStudioDraftVisible(video({ draft }))).toBe(true);
  });
});
