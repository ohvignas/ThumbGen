import { describe, it, expect } from "vitest";
import {
  messageAsksToAnalyzeOrImprove,
  selectTurnImageSources,
} from "@/lib/agent/v2/attach-turn-images";
import type { MentionableImage } from "@/lib/canvas/mentionable-images";

const PREVIEW: MentionableImage = {
  visibleId: "#P1",
  image: "stored:gi_p1",
  imageNode: "prev",
  label: "Aperçu",
};
const OVERLAY: MentionableImage = {
  visibleId: "#OV1",
  image: "stored:gi_ov1",
  imageNode: "ov",
  label: "Hook",
};

const SNAPSHOT_WITH_APERCU = {
  nodes: [
    {
      id: "prev",
      type: "preview",
      summary: {
        label: "Aperçu",
        selectedImage: "stored:gi_p1",
        selectedVisibleId: "#P1",
        images: [{ visibleId: "#P1", image: "stored:gi_p1" }],
      },
    },
    {
      id: "gen",
      type: "generator",
      summary: {
        selectedImage: "stored:gi_hist",
        selectedVisibleId: "#HIST",
        images: [
          { visibleId: "#HIST", image: "stored:gi_hist" },
          { visibleId: "#OLD", image: "stored:gi_old" },
        ],
      },
    },
  ],
  edges: [],
  currentThumbnails: [
    { visibleId: "#P1", image: "stored:gi_p1", imageNode: "prev" },
    { visibleId: "#HIST", image: "stored:gi_hist", imageNode: "gen" },
  ],
};

describe("messageAsksToAnalyzeOrImprove", () => {
  it("matches FR+EN analyse / regarder / améliorer / iterate", () => {
    expect(messageAsksToAnalyzeOrImprove("améliore ça")).toBe(true);
    expect(messageAsksToAnalyzeOrImprove("Améliore la miniature")).toBe(true);
    expect(messageAsksToAnalyzeOrImprove("peux-tu analyser l'image ?")).toBe(true);
    expect(messageAsksToAnalyzeOrImprove("regarde le workflow")).toBe(true);
    expect(messageAsksToAnalyzeOrImprove("analyze this thumbnail")).toBe(true);
    expect(messageAsksToAnalyzeOrImprove("please improve it")).toBe(true);
    expect(messageAsksToAnalyzeOrImprove("iterate on the current one")).toBe(true);
    expect(messageAsksToAnalyzeOrImprove("look at the preview")).toBe(true);
  });

  it("does not match a plain hello", () => {
    expect(messageAsksToAnalyzeOrImprove("salut")).toBe(false);
    expect(messageAsksToAnalyzeOrImprove("hello")).toBe(false);
    expect(messageAsksToAnalyzeOrImprove("merci")).toBe(false);
  });
});

describe("selectTurnImageSources", () => {
  it("uses mentioned images only, even when the canvas has other aperçus", () => {
    const sources = selectTurnImageSources({
      userText: "améliore @#P1",
      mentionedImages: [PREVIEW, OVERLAY],
      canvasSnapshot: SNAPSHOT_WITH_APERCU,
    });
    expect(sources.map((row) => row.image)).toEqual(["stored:gi_p1", "stored:gi_ov1"]);
  });

  it("skips unresolved @ tokens with no image ref", () => {
    const sources = selectTurnImageSources({
      userText: "regarde @#ZZZZ",
      mentionedImages: [{ visibleId: "#ZZZZ", image: "", imageNode: "", label: "#ZZZZ" }],
      canvasSnapshot: SNAPSHOT_WITH_APERCU,
    });
    expect(sources).toEqual([]);
  });

  it("on améliore without @, attaches visible aperçu / current thumbnail, not generator history", () => {
    const sources = selectTurnImageSources({
      userText: "améliore ça",
      mentionedImages: [],
      canvasSnapshot: SNAPSHOT_WITH_APERCU,
    });
    expect(sources.map((row) => row.image)).toEqual(["stored:gi_p1"]);
    expect(sources.map((row) => row.image)).not.toContain("stored:gi_hist");
    expect(sources.map((row) => row.image)).not.toContain("stored:gi_old");
  });

  it("on salut, attaches nothing even if the canvas has an aperçu", () => {
    expect(
      selectTurnImageSources({
        userText: "salut",
        mentionedImages: [],
        canvasSnapshot: SNAPSHOT_WITH_APERCU,
      }),
    ).toEqual([]);
  });

  it("caps at 8 images and at most 2 per generator", () => {
    const mentioned = Array.from({ length: 10 }, (_, i) => ({
      visibleId: `#G${i}`,
      image: `stored:gi_g${i}`,
      imageNode: i < 6 ? "gen" : "prev",
      label: `g${i}`,
    }));
    const sources = selectTurnImageSources({
      userText: "regarde ça",
      mentionedImages: mentioned,
      canvasSnapshot: {
        nodes: [
          { id: "gen", type: "generator" },
          { id: "prev", type: "preview" },
        ],
      },
    });
    expect(sources.filter((row) => row.imageNode === "gen")).toHaveLength(2);
    expect(sources).toHaveLength(6);
  });

  it("falls back to currentThumbnails when there is no visible aperçu card", () => {
    const sources = selectTurnImageSources({
      userText: "analyze this",
      mentionedImages: [],
      canvasSnapshot: {
        nodes: [{ id: "gen", type: "generator", summary: { selectedImage: "stored:gi_win" } }],
        edges: [],
        currentThumbnails: [{ visibleId: "#WIN", image: "stored:gi_win", imageNode: "gen" }],
      },
    });
    expect(sources.map((row) => row.image)).toEqual(["stored:gi_win"]);
  });
});
