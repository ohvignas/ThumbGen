import { describe, it, expect } from "vitest";
import { snapshotCanvas } from "@/components/panels/chat/canvas-snapshot";
import {
  CURRENT_THUMBNAIL_ROLE,
  describeCurrentThumbnails,
} from "@/lib/canvas/current-thumbnail";

describe("currentThumbnails", () => {
  it("omits the list when nothing has been generated", () => {
    const snap = snapshotCanvas(
      [
        { id: "p-1", type: "prompt", data: { prompt: "Full first-gen anatomy." } },
        { id: "g-1", type: "generator", data: { model: "nano-banana", aspectRatio: "16x9", numImages: 1 } },
      ],
      [{ source: "p-1", target: "g-1", targetHandle: "prompt-in" }],
    ) as { currentThumbnails?: unknown };
    expect(snap.currentThumbnails).toBeUndefined();
  });

  it("labels a connected generated preview plus its parent prompt as the current thumbnail", () => {
    const snap = snapshotCanvas(
      [
        { id: "p-1", type: "prompt", selected: true, data: { prompt: "The person in the identity/avatar reference photos, right third." } },
        {
          id: "g-1",
          type: "generator",
          data: { model: "nano-banana", aspectRatio: "16x9" },
        },
        {
          id: "prev",
          type: "preview",
          selected: true,
          data: { label: "Nano #1", generatedImages: ["/api/generated-images/image?id=p1"], selectedImageIndex: 0 },
        },
      ],
      [
        { source: "p-1", target: "g-1", targetHandle: "prompt-in" },
        { source: "g-1", target: "prev", targetHandle: "preview-in" },
      ],
    ) as {
      currentThumbnails: Array<{
        role: string;
        image: string;
        imageNode: string;
        visibleId?: string;
        parentPromptNode?: string;
        parentPrompt?: string;
        selected?: true;
      }>;
    };
    expect(snap.currentThumbnails).toHaveLength(1);
    expect(snap.currentThumbnails[0]).toEqual({
      role: CURRENT_THUMBNAIL_ROLE,
      image: "stored:gi_p1",
      imageNode: "prev",
      visibleId: "#P1",
      parentPromptNode: "p-1",
      parentPrompt: "The person in the identity/avatar reference photos, right third.",
      selected: true,
    });
    expect(snap.currentThumbnails[0].role).toContain("improvements apply to THIS image");
  });

  it("links a stored:gi_ swipe on ref-in to the generator's prompt", () => {
    const rows = describeCurrentThumbnails(
      [
        { id: "p-1", type: "prompt", summary: { prompt: "Original 7-sentence prompt." } },
        { id: "g-1", type: "generator", summary: { generatedCount: 0 } },
        { id: "ref-iter", type: "swipeFile", summary: { kind: "reference", source: "library:stored:gi_vci-g2", hasImage: true } },
      ],
      [
        { source: "p-1", target: "g-1", targetHandle: "prompt-in" },
        { source: "ref-iter", target: "g-1", targetHandle: "ref-in" },
      ],
    );
    expect(rows).toEqual([
      {
        role: CURRENT_THUMBNAIL_ROLE,
        image: "stored:gi_vci-g2",
        imageNode: "ref-iter",
        visibleId: "#VCIG2",
        parentPromptNode: "p-1",
        parentPrompt: "Original 7-sentence prompt.",
      },
    ]);
  });
});
