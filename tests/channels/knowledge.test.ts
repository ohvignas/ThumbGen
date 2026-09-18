import { describe, expect, it } from "vitest";
import { EMPTY_CHANNEL_KNOWLEDGE } from "@/lib/youtube/knowledge-schema";
import { compactKnowledgeBlock, knowledgeToMarkdown } from "@/lib/youtube/knowledge";

describe("channel knowledge document", () => {
  it("renders a markdown bible from the structured JSON", () => {
    const md = knowledgeToMarkdown({
      ...EMPTY_CHANNEL_KNOWLEDGE,
      identity: {
        name: "Antoine",
        handle: "@antoine",
        niche: "Productivité",
        positioning: "Tutos concrets",
        uniqueAngle: "Sans jargon",
      },
      thumbnails: {
        winningTypes: ["face_text"],
        visualLanguage: "Fond sombre",
        textStyle: "3 mots max",
        faceUsage: "Gros plan",
        avoid: ["fond blanc"],
      },
      standingInstructions: "Toujours un visage.",
    });
    expect(md).toContain("# Antoine");
    expect(md).toContain("@antoine");
    expect(md).toContain("face_text");
    expect(md).toContain("Toujours un visage.");
  });

  it("compacts for the agent prompt", () => {
    const block = compactKnowledgeBlock({
      ...EMPTY_CHANNEL_KNOWLEDGE,
      identity: { ...EMPTY_CHANNEL_KNOWLEDGE.identity, niche: "IA" },
      thumbnails: { ...EMPTY_CHANNEL_KNOWLEDGE.thumbnails, winningTypes: ["reaction"] },
    });
    expect(block).toContain("Niche: IA");
    expect(block).toContain("Winning thumbnail types: reaction");
    expect(block).not.toContain("# ");
  });
});
