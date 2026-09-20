import { describe, it, expect } from "vitest";
import {
  applyMentionPick,
  composerMentionQuery,
  filterMentionableImages,
  mentionQueryAtCursor,
} from "@/lib/agent/mentions/mention-query";
import {
  catalogMentionableImages,
  catalogMentionableImagesFromSnapshot,
  parseMentionTokens,
  resolveMentionedImages,
  type MentionableImage,
} from "@/lib/canvas/mentionable-images";

const PREVIEW = "/api/generated-images/image?id=p1";
const VARIANT = "/api/generated-images/image?id=abc123";
const COVER = "/api/generated-images/image?id=aaaa1111-bbbb-cccc-dddd-eeeeeeeeeeee";

const catalog: MentionableImage[] = [
  { visibleId: "#P1", image: "stored:gi_p1", imageNode: "prev", label: "Nano #1", previewUrl: PREVIEW },
  { visibleId: "#ABC123", image: "stored:gi_abc123", imageNode: "prev", label: "Nano #1 · 2/2", previewUrl: VARIANT },
];

describe("mentionQueryAtCursor", () => {
  it("opens at start of input and after whitespace", () => {
    expect(mentionQueryAtCursor("@", 1)).toEqual({ start: 0, query: "" });
    expect(mentionQueryAtCursor("@#p1", 4)).toEqual({ start: 0, query: "#p1" });
    expect(mentionQueryAtCursor("regarde @ab", 11)).toEqual({ start: 8, query: "ab" });
    expect(mentionQueryAtCursor("a\n@", 3)).toEqual({ start: 2, query: "" });
  });

  it("does not steal @ inside an email", () => {
    expect(mentionQueryAtCursor("user@host", 9)).toBeNull();
    expect(mentionQueryAtCursor("user@", 5)).toBeNull();
  });

  it("only looks at the token ending at the cursor", () => {
    expect(mentionQueryAtCursor("@#P1 plus", 9)).toBeNull();
    expect(mentionQueryAtCursor("@#P1 plus", 4)).toEqual({ start: 0, query: "#P1" });
  });
});

describe("composerMentionQuery", () => {
  it("opens on a lone @ even when the stored cursor is still 0", () => {
    expect(mentionQueryAtCursor("@", 0)).toBeNull();
    expect(composerMentionQuery("@", 0)).toEqual({ start: 0, query: "" });
    expect(composerMentionQuery("@#p", 0)).toEqual({ start: 0, query: "#p" });
    expect(composerMentionQuery("go @", 0)).toEqual({ start: 3, query: "" });
    expect(composerMentionQuery("go @", 1)).toBeNull();
  });
});

describe("filterMentionableImages", () => {
  it("lists every image on an empty query and filters by id or label", () => {
    expect(filterMentionableImages(catalog, "").map((row) => row.visibleId)).toEqual(["#P1", "#ABC123"]);
    expect(filterMentionableImages(catalog, "p1").map((row) => row.visibleId)).toEqual(["#P1"]);
    expect(filterMentionableImages(catalog, "#AB").map((row) => row.visibleId)).toEqual(["#ABC123"]);
    expect(filterMentionableImages(catalog, "nano").map((row) => row.visibleId)).toEqual(["#P1", "#ABC123"]);
    expect(filterMentionableImages(catalog, "zzzz")).toEqual([]);
  });
});

describe("applyMentionPick", () => {
  it("replaces the open @query with @#ID and a trailing space", () => {
    expect(applyMentionPick("@", 1, "#P1")).toEqual({ text: "@#P1 ", cursor: 5 });
    expect(applyMentionPick("go @#p", 6, "#P1")).toEqual({ text: "go @#P1 ", cursor: 8 });
  });

  it("replaces a lone @ even when the stored cursor is still 0", () => {
    expect(applyMentionPick("@", 0, "#P1")).toEqual({ text: "@#P1 ", cursor: 5 });
  });
});

describe("parseMentionTokens", () => {
  it("reads @#id and @miniature:<storedId>", () => {
    expect(parseMentionTokens("améliore @#P1 svp")).toEqual([{ visibleId: "#P1" }]);
    expect(parseMentionTokens("regarde @#abc123 et @miniature:p1")).toEqual([
      { visibleId: "#ABC123" },
      { storedId: "p1" },
    ]);
    expect(parseMentionTokens("pas de mention")).toEqual([]);
    expect(parseMentionTokens("user@host")).toEqual([]);
  });
});

describe("catalogMentionableImages", () => {
  it("lists aperçu cards and marks the cover, not leftover generator frames", () => {
    const rows = catalogMentionableImages(
      [
        {
          id: "prev",
          type: "preview",
          data: { label: "Nano #1", generatedImages: [PREVIEW, VARIANT], selectedImageIndex: 0 },
        },
        {
          id: "gen",
          type: "generator",
          data: { generatedImages: [PREVIEW, "/api/generated-images/image?id=g2"], selectedImageIndex: 1 },
        },
      ],
      { coverImageUrl: PREVIEW },
    );
    expect(rows.map((row) => ({ visibleId: row.visibleId, image: row.image, imageNode: row.imageNode, label: row.label }))).toEqual([
      { visibleId: "#P1", image: "stored:gi_p1", imageNode: "prev", label: "Nano #1 · 1/2 · gagnante" },
      { visibleId: "#ABC123", image: "stored:gi_abc123", imageNode: "prev", label: "Nano #1 · 2/2" },
    ]);
  });

  it("does not list generator A/B history when no aperçu card is on the board", () => {
    const rows = catalogMentionableImages(
      [
        {
          id: "gen",
          type: "generator",
          data: {
            generatedImagesByVariant: {
              A: ["/api/generated-images/image?id=va"],
              B: ["/api/generated-images/image?id=vb"],
            },
          },
        },
      ],
      { coverImageUrl: COVER },
    );
    expect(rows.map((row) => row.label)).toEqual(["Miniature gagnante"]);
    expect(rows[0]).toMatchObject({ visibleId: "#EEEEEE", imageNode: "cover" });
  });

  it("lists one row when the canvas has one aperçu and generators only store history", () => {
    const winner = "/api/generated-images/image?id=e69ac3-winner";
    const rows = catalogMentionableImages(
      [
        {
          id: "f65fc1f2",
          type: "preview",
          data: { label: "GPT Image 2.5 Sunburst (précis) #2", generatedImages: [winner] },
        },
        {
          id: "408c5827",
          type: "generator",
          data: {
            generatedImagesByVariant: {
              A: ["/api/generated-images/image?id=f9010b-hist", winner],
            },
            generatedImages: ["/api/generated-images/image?id=f9010b-hist", winner],
            selectedImageIndex: 1,
          },
        },
        {
          id: "dd98338f",
          type: "generator",
          data: {
            count: 2,
            generatedImagesByVariant: {
              A: ["/api/generated-images/image?id=0f6a5f-a1", "/api/generated-images/image?id=05d2c7-a2"],
            },
          },
        },
      ],
      { coverImageUrl: winner },
    );
    expect(rows.map((row) => ({ visibleId: row.visibleId, imageNode: row.imageNode, label: row.label }))).toEqual([
      {
        visibleId: "#WINNER",
        imageNode: "f65fc1f2",
        label: "GPT Image 2.5 Sunburst (précis) #2 · gagnante",
      },
    ]);
  });

  it("includes a text-overlay result and skips logos, faces, and swipe files", () => {
    const rows = catalogMentionableImages([
      {
        id: "ov",
        type: "textOverlay",
        data: { label: "Hook", generatedImages: ["/api/generated-images/image?id=ov1"] },
      },
      { id: "logo", type: "logo", data: { imageUrl: "/api/logos/image?f=brand.png" } },
      { id: "face", type: "faceReference", data: { personaId: "p1" } },
      { id: "swipe", type: "swipeFile", data: { image_source: "stored:sf_s1" } },
    ]);
    expect(rows.map((row) => ({ visibleId: row.visibleId, imageNode: row.imageNode, label: row.label }))).toEqual([
      { visibleId: "#OV1", imageNode: "ov", label: "Hook" },
    ]);
  });

  it("lists live sketch nodes with a croquis label so @ can point at them", () => {
    const rows = catalogMentionableImages([
      {
        id: "sk-live",
        type: "sketch",
        data: { image_source: "generated:sk_abc123", imageUrl: "/api/generated-sketches/sk_abc123", label: "Sketch IA" },
      },
      { id: "sk-empty", type: "sketch", data: { label: "Slot A" } },
      {
        id: "prev",
        type: "preview",
        data: { label: "Nano #1", generatedImages: [PREVIEW] },
      },
    ]);
    expect(rows.map((row) => ({ visibleId: row.visibleId, image: row.image, imageNode: row.imageNode, label: row.label }))).toEqual([
      { visibleId: "#P1", image: "stored:gi_p1", imageNode: "prev", label: "Nano #1" },
      {
        visibleId: "#ABC123",
        image: "generated:sk_abc123",
        imageNode: "sk-live",
        label: "Croquis",
      },
    ]);
    expect(filterMentionableImages(rows, "croquis").map((row) => row.imageNode)).toEqual(["sk-live"]);
  });
});

describe("catalogMentionableImagesFromSnapshot + resolve", () => {
  it("resolves @#id against snapshot images the agent already has", () => {
    const catalogFromSnap = catalogMentionableImagesFromSnapshot({
      nodes: [
        {
          id: "prev",
          type: "preview",
          summary: {
            label: "Nano #1",
            selectedImage: "stored:gi_p1",
            selectedVisibleId: "#P1",
            images: [{ visibleId: "#P1", image: "stored:gi_p1" }],
          },
        },
      ],
    });
    expect(resolveMentionedImages("améliore @#P1", catalogFromSnap)).toEqual([
      { visibleId: "#P1", image: "stored:gi_p1", imageNode: "prev", label: "Nano #1" },
    ]);
    expect(resolveMentionedImages("@#ZZZZ", catalogFromSnap)).toEqual([
      { visibleId: "#ZZZZ", image: "", imageNode: "", label: "#ZZZZ" },
    ]);
    expect(resolveMentionedImages("x", catalogFromSnap, catalog.slice(0, 1))).toEqual([catalog[0]]);
  });

  it("ignores generator history and currentThumbnails leftovers in the snapshot catalog", () => {
    const rows = catalogMentionableImagesFromSnapshot({
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
            images: [
              { visibleId: "#F9010B", image: "stored:gi_f9010b" },
              { visibleId: "#0F6A5F", image: "stored:gi_0f6a5f" },
            ],
            selectedImage: "stored:gi_f9010b",
            selectedVisibleId: "#F9010B",
          },
        },
      ],
      currentThumbnails: [
        { visibleId: "#P1", image: "stored:gi_p1", imageNode: "prev" },
        { visibleId: "#F9010B", image: "stored:gi_f9010b", imageNode: "gen" },
        { visibleId: "#0F6A5F", image: "stored:gi_0f6a5f", imageNode: "gen2" },
      ],
    });
    expect(rows.map((row) => row.visibleId)).toEqual(["#P1"]);
  });

  it("lists live sketch nodes from the compact snapshot", () => {
    const rows = catalogMentionableImagesFromSnapshot({
      nodes: [
        {
          id: "sk-live",
          type: "sketch",
          summary: {
            label: "Sketch IA",
            source: "library:generated:sk_abc123",
            hasImage: true,
          },
        },
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
      ],
    });
    expect(rows.map((row) => ({ visibleId: row.visibleId, image: row.image, imageNode: row.imageNode, label: row.label }))).toEqual([
      { visibleId: "#P1", image: "stored:gi_p1", imageNode: "prev", label: "Aperçu" },
      { visibleId: "#ABC123", image: "generated:sk_abc123", imageNode: "sk-live", label: "Croquis" },
    ]);
    expect(resolveMentionedImages("regarde @#ABC123", rows)).toEqual([
      { visibleId: "#ABC123", image: "generated:sk_abc123", imageNode: "sk-live", label: "Croquis" },
    ]);
  });
});
