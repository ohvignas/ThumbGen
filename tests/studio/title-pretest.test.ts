import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/lib/db";
import { setSetting } from "@/lib/settings";
import { emptyStudioDraft } from "@/lib/studio/page-template";
import { createStudioVideo, saveStudioDraft } from "@/lib/studio/store";
import { pretestTitleVariants, rankStudioTitles } from "@/lib/studio/title-pretest";

const { jevClickNouls } = vi.hoisted(() => ({
  jevClickNouls: vi.fn(),
}));

vi.mock("@/lib/typesafe/rerank-titles", () => ({
  jevClickNouls,
}));

let videoId = "";

beforeEach(() => {
  getDb().exec("DELETE FROM studio_drafts");
  getDb().exec("DELETE FROM studio_videos");
  getDb().exec("DELETE FROM settings");
  jevClickNouls.mockReset();
  videoId = createStudioVideo({ title: "Vibe Coding", etiquette: "En cours" }).videoId;
  const draft = emptyStudioDraft();
  draft.titleVariants[0] = {
    title: "Créer une app sans coder",
    thumbText: "vibe coding",
    visualConcept: "",
  };
  draft.titleVariants[1] = {
    title: "Vibe Coding : c’est quoi ?",
    thumbText: "LE GUIDE DÉBUTANT",
    visualConcept: "",
  };
  saveStudioDraft(videoId, draft);
});

describe("pretestTitleVariants", () => {
  it("returns the exact setup reason without fetching when the key is missing", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const rows = await pretestTitleVariants(videoId);

    expect(rows).toHaveLength(3);
    expect(rows[0]?.score).toBeNull();
    expect(rows[0]?.reason).toBe("Ajoute TypeSafe dans Réglages → Connexions pour un pré-test Jev");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(jevClickNouls).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("ranks the three persisted title rows through the existing Jev client", async () => {
    setSetting("typesafeApiKey", "test-typesafe-key");
    jevClickNouls.mockResolvedValue(new Map([["row_0", 0.82]]));

    const rows = await pretestTitleVariants(videoId);

    expect(jevClickNouls).toHaveBeenCalledWith(
      "studio-pretest",
      [
        { videoId: "row_0", title: "Créer une app sans coder" },
        { videoId: "row_1", title: "Vibe Coding : c’est quoi ?" },
        { videoId: "row_2", title: "" },
      ],
      "followed",
    );
    expect(rows[0]).toMatchObject({ score: 0.82, reason: "" });
    expect(rows[1]).toMatchObject({ score: null, reason: "Jev n’a pas noté cette ligne" });
  });

  it("exposes a mockable rankStudioTitles wrapper", async () => {
    jevClickNouls.mockResolvedValue(new Map([["row_0", 0.5]]));
    await expect(rankStudioTitles([{ videoId: "row_0", title: "Titre" }])).resolves.toEqual(
      new Map([["row_0", 0.5]]),
    );
  });
});
