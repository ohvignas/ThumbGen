import { describe, expect, it } from "vitest";
import {
  OTHER_THEME_ID,
  OTHER_THEME_LABEL,
  clusterVideoThemes,
  isWinningTheme,
  summarizeThemes,
  themeTerms,
  themeWhy,
  visibleThemeRows,
  type ThemeSummaryInput,
} from "@/lib/youtube/video-themes";

const NOW = new Date("2026-09-19T12:00:00.000Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();

describe("themeTerms", () => {
  it("drops stopwords, URLs and timestamps, and keeps the topic", () => {
    expect(themeTerms("J'ai testé Cursor 2.0 vs Claude Code")).toEqual(
      expect.arrayContaining(["cursor 2.0", "claude", "code", "claude code"]),
    );
    expect(themeTerms("J'ai testé Cursor 2.0 vs Claude Code")).not.toEqual(
      expect.arrayContaining(["jai", "teste", "testé", "vs", "j'ai"]),
    );
  });

  it("reads the topic from the description when the title is clickbait", () => {
    const terms = themeTerms("TU NE VAS PAS Y CROIRE", "On parle de Cursor 2.0 et de Claude Code dans cette vidéo. https://x.com/foo 1:23 intro");
    expect(terms).toEqual(expect.arrayContaining(["cursor 2.0", "claude code"]));
    expect(terms.some((term) => term.includes("http") || term === "intro")).toBe(false);
  });
});

describe("clusterVideoThemes", () => {
  it("groups videos that share a title or description topic", () => {
    const themes = clusterVideoThemes([
      { videoId: "c1", title: "Cursor 2.0 est sorti" },
      { videoId: "c2", title: "J'ai testé Cursor 2.0" },
      { videoId: "c3", title: "Mon avis", description: "Après une semaine sur Cursor 2.0." },
      { videoId: "i1", title: "iPhone 17 review" },
      { videoId: "i2", title: "Test iPhone 17 Pro" },
      { videoId: "z1", title: "Recette de tarte aux pommes" },
    ]);

    const cursor = themes.find((theme) => theme.videoIds.includes("c1"));
    const iphone = themes.find((theme) => theme.videoIds.includes("i1"));
    const other = themes.find((theme) => theme.themeId === OTHER_THEME_ID);

    expect(cursor?.label.toLowerCase()).toContain("cursor");
    expect(cursor?.videoIds.sort()).toEqual(["c1", "c2", "c3"]);
    expect(iphone?.label.toLowerCase()).toContain("iphone");
    expect(iphone?.videoIds.sort()).toEqual(["i1", "i2"]);
    expect(other).toEqual(
      expect.objectContaining({ themeId: OTHER_THEME_ID, label: OTHER_THEME_LABEL, videoIds: ["z1"] }),
    );
  });

  it("does not invent a theme from shared description boilerplate", () => {
    const themes = clusterVideoThemes([
      { videoId: "a", title: "Recette de tarte", description: "Profite de 10% avec AV10 — plans 12 mois https://x.com/x" },
      { videoId: "b", title: "Bricolage étagère", description: "Profite de 10% avec AV10 — plans 12 mois https://x.com/x" },
    ]);
    expect(themes).toEqual([
      expect.objectContaining({ themeId: OTHER_THEME_ID, videoIds: ["a", "b"] }),
    ]);
  });

  it("is deterministic and ignores visual thumbnail classes", () => {
    const videos = [
      { videoId: "b", title: "Claude Code agent" },
      { videoId: "a", title: "Claude Code tips" },
    ];
    expect(clusterVideoThemes(videos)).toEqual(clusterVideoThemes([...videos].reverse()));
    expect(clusterVideoThemes(videos)[0]?.label.toLowerCase()).toContain("claude");
  });

  it("creates a theme from a description-only topic shared by two videos", () => {
    const themes = clusterVideoThemes([
      { videoId: "a", title: "TU NE VAS PAS Y CROIRE", description: "On parle de Cursor 2.0 et de Claude Code." },
      { videoId: "b", title: "VOUS ALLEZ ÊTRE SURPRIS", description: "Cursor 2.0 a changé ma façon de coder." },
      { videoId: "c", title: "Recette de tarte aux pommes" },
    ]);
    const cursor = themes.find((theme) => theme.label.toLowerCase().includes("cursor"));
    expect(cursor?.videoIds.sort()).toEqual(["a", "b"]);
    expect(themes.find((theme) => theme.themeId === OTHER_THEME_ID)?.videoIds).toEqual(["c"]);
  });

  it("drops a numbered description promo residue even when bodies differ", () => {
    const themes = clusterVideoThemes([
      { videoId: "a", title: "Recette de tarte", description: "Cuisson lente. Profite de 10% avec AV10 — plans 12 mois" },
      { videoId: "b", title: "Bricolage étagère", description: "Vis inox. Code AV10 10 12 passant ici" },
      { videoId: "c", title: "Voyage à Kyoto", description: "Temple Fushimi. AV10 10 12 passant" },
      { videoId: "d", title: "Piano jazz", description: "Standards only" },
    ]);
    expect(themes.some((theme) => /av10/i.test(theme.label))).toBe(false);
  });

  it("drops a description footer that appears across the corpus", () => {
    const footer = "Profite de 10% avec AV10 — plans 12 mois https://x.com/x";
    const themes = clusterVideoThemes([
      { videoId: "a", title: "Recette de tarte", description: `Cuisson 40 minutes. ${footer}` },
      { videoId: "b", title: "Bricolage étagère", description: `Vis et chevilles. ${footer}` },
      { videoId: "c", title: "Voyage à Kyoto", description: `Temple Fushimi. ${footer}` },
    ]);
    expect(themes.some((theme) => theme.label.toLowerCase().includes("av10"))).toBe(false);
    expect(themes).toEqual([expect.objectContaining({ themeId: OTHER_THEME_ID, videoIds: ["a", "b", "c"] })]);
  });
});

describe("themeWhy", () => {
  it("states overperformance, recency and the title hook — no psychology", () => {
    expect(
      themeWhy({
        score: 4.2,
        ageDays: 18,
        title: "Cursor 2.0 vs Claude Code",
        keywords: ["cursor 2.0", "claude code"],
      }),
    ).toBe("×4,2 vs médiane · 18 j · titre: Cursor 2.0");

    expect(
      themeWhy({
        score: null,
        ageDays: 3,
        title: "iPhone 17 drop",
        keywords: ["iphone 17"],
      }),
    ).toBe("récente (<7 j) · titre: iPhone 17");

    expect(
      themeWhy({
        score: 21.4,
        ageDays: 150,
        title: "Installer un LLM en local avec LM Studio (Gemma 4) | tutoriel complet",
        keywords: ["openclaw"],
      }),
    ).toBe(
      "×21,4 vs médiane · 5 mois · titre: Installer un LLM en local avec LM Studio (Gemma 4) | tutoriel complet",
    );
  });
});

describe("summarizeThemes", () => {
  const row = (input: Partial<ThemeSummaryInput> & Pick<ThemeSummaryInput, "videoId" | "title" | "channelId">): ThemeSummaryInput => ({
    channelTitle: input.channelTitle ?? input.channelId,
    thumbnailUrl: `https://i.ytimg.com/vi/${input.videoId}/mqdefault.jpg`,
    publishedAt: input.publishedAt ?? daysAgo(20),
    score: input.score ?? null,
    rank: input.rank,
    description: input.description,
    ...input,
  });

  it("ranks themes by swipe rank, names the winning idea, and keeps the best thumb per channel", () => {
    const rows = summarizeThemes(
      [
        row({ videoId: "mine-cursor-old", channelId: "mine", channelTitle: "Ma chaîne", title: "Cursor 2.0 lent", score: 9, rank: 0.2, publishedAt: daysAgo(200) }),
        row({ videoId: "mine-cursor-now", channelId: "mine", channelTitle: "Ma chaîne", title: "Cursor 2.0 vs Claude", score: 3.5, rank: 1.4, publishedAt: daysAgo(18) }),
        row({ videoId: "oth-cursor", channelId: "oth", channelTitle: "Concurrent", title: "Cursor 2.0 tips", score: 5, rank: 1.1, publishedAt: daysAgo(21) }),
        row({ videoId: "oth-iphone", channelId: "oth", channelTitle: "Concurrent", title: "iPhone 17 review", score: 1.2, rank: 0.4, publishedAt: daysAgo(21) }),
        row({ videoId: "mine-iphone", channelId: "mine", channelTitle: "Ma chaîne", title: "iPhone 17 Pro test", score: 1.1, rank: 0.3, publishedAt: daysAgo(22) }),
        row({ videoId: "lone", channelId: "mine", channelTitle: "Ma chaîne", title: "Tarte aux pommes", score: 2, rank: 0.5, publishedAt: daysAgo(40) }),
      ],
      NOW,
    );

    expect(rows[0]?.label.toLowerCase()).toContain("cursor");
    expect(rows[0]).toMatchObject({
      enoughData: true,
      scoredCount: 3,
      totalCount: 3,
      medianScore: 5,
      winner: { videoId: "mine-cursor-now", channelTitle: "Ma chaîne", score: 3.5 },
    });
    expect(rows[0]?.winner?.why).toContain("×3,5 vs médiane");
    expect(rows[0]?.winner?.why).toContain("18 j");
    expect(rows[0]?.winner?.why).toContain("titre:");
    expect(rows[0]?.perChannel.map((entry) => [entry.channelTitle, entry.videoId])).toEqual([
      ["Ma chaîne", "mine-cursor-now"],
      ["Concurrent", "oth-cursor"],
    ]);

    const iphone = rows.find((theme) => theme.label.toLowerCase().includes("iphone"));
    expect(iphone).toMatchObject({ enoughData: false, scoredCount: 2, winner: null });
    expect(rows.some((theme) => theme.themeId === OTHER_THEME_ID && theme.videoIds.includes("lone"))).toBe(true);
    expect(rows.find((theme) => theme.themeId === OTHER_THEME_ID)).toMatchObject({ enoughData: false, winner: null });
    expect(isWinningTheme(rows.find((theme) => theme.themeId === OTHER_THEME_ID)!)).toBe(false);
    expect(visibleThemeRows(rows, 1)[0]?.themeId).not.toBe(OTHER_THEME_ID);
  });

  it("never elects Autres sujets as the winning theme even with three scored leftovers", () => {
    const rows = summarizeThemes(
      [
        row({ videoId: "a", channelId: "c", title: "Tarte aux pommes", score: 5, rank: 1.2 }),
        row({ videoId: "b", channelId: "c", title: "Étagère murale", score: 4, rank: 1.1 }),
        row({ videoId: "c", channelId: "c", title: "Voyage à Kyoto", score: 9, rank: 2 }),
      ],
      NOW,
    );
    expect(rows).toEqual([
      expect.objectContaining({
        themeId: OTHER_THEME_ID,
        totalCount: 3,
        scoredCount: 3,
        enoughData: false,
        winner: null,
        medianScore: null,
      }),
    ]);
    expect(visibleThemeRows(rows, 3)).toEqual([]);
  });
});
