import { describe, expect, it } from "vitest";
import {
  channelStatusLabel,
  channelsDataVersion,
  formatCount,
  descriptionExcerpt,
  formatPublishedDate,
  formatRelativeTime,
  formatVideoAge,
  formatScore,
  formatSubscribers,
  formatUsd,
  climbHint,
  formatJevNote,
  performanceBandLabel,
  formatViews,
  formatViewsPerDay,
  performanceBadge,
  toggleFilterValue,
  typesFilterLabel,
  captionSourceLabel,
  holdBandLabel,
  WHY_DISCLAIMER,
  whyFactsSentence,
} from "@/components/library/followed-channels/view";
import { QUOTA_SYNC_ERROR, type ChannelsResponse } from "@/lib/youtube/types";

const NOW = new Date("2026-09-16T12:00:00.000Z");

describe("numbers", () => {
  it("formats counts and compact views the French way, with plain spaces", () => {
    expect(formatCount(1240)).toBe("1 240");
    expect(formatViews(0)).toBe("0 vue");
    expect(formatViews(1)).toBe("1 vue");
    expect(formatViews(850)).toBe("850 vues");
    expect(formatViews(12_000)).toBe("12 k vues");
    expect(formatViews(1_200_000)).toBe("1,2 M vues");
    expect(formatViewsPerDay(850)).toBe("850 vues/j");
    expect(formatJevNote(7.2)).toBe("7,2/10");
    expect(climbHint("average")).toBe("Moyenne depuis la publication (un seul relevé)");
    expect(climbHint("delta")).toBe("Ça grimpe : écart de vues entre deux relevés");
    expect(performanceBandLabel("over")).toBe("Surperforme");
    expect(performanceBandLabel("neutral")).toBe("Dans la moyenne");
    expect(performanceBandLabel("under")).toBe("Sous-performe");
    expect(formatSubscribers(12_500)).toBe("12,5 k abonnés");
    expect(formatSubscribers(1)).toBe("1 abonné");
    expect(formatSubscribers(null)).toBe("abonnés masqués");
  });

  it("formats scores and dollars", () => {
    expect(formatScore(0.4)).toBe("×0,4");
    expect(formatScore(8.5)).toBe("×8,5");
    expect(formatScore(3)).toBe("×3,0");
    expect(formatUsd(0.0975)).toBe("0,10 $");
    expect(formatUsd(0.004)).toBe("moins de 0,01 $");
    expect(formatUsd(0)).toBe("0,00 $");
  });
});

describe("dates", () => {
  it("says how long ago", () => {
    expect(formatRelativeTime("2026-09-16T11:59:30.000Z", NOW)).toBe("à l'instant");
    expect(formatRelativeTime("2026-09-16T11:55:00.000Z", NOW)).toBe("il y a 5 min");
    expect(formatRelativeTime("2026-09-16T10:00:00.000Z", NOW)).toBe("il y a 2 h");
    expect(formatRelativeTime("2026-09-13T12:00:00.000Z", NOW)).toBe("il y a 3 j");
  });

  it("prints a short French date", () => {
    expect(formatPublishedDate("2026-09-12T10:00:00.000Z")).toBe("12 sept. 2026");
    expect(formatPublishedDate("not a date")).toBe("");
  });

  it("states age and clips a description", () => {
    expect(formatVideoAge("2026-09-16T12:00:00.000Z", NOW)).toBe("moins d'un jour");
    expect(formatVideoAge("2026-08-20T12:00:00.000Z", NOW)).toBe("27 jours");
    expect(descriptionExcerpt("  Un   texte.  ")).toBe("Un texte.");
    expect(descriptionExcerpt("x".repeat(230)).endsWith("…")).toBe(true);
  });
});

describe("channelStatusLabel", () => {
  const base = { syncStatus: "idle" as const, syncError: null, lastSyncedAt: "2026-09-16T10:00:00.000Z", videoCount: 320 };

  it.each([
    [{ ...base, syncStatus: "syncing" as const }, "Synchronisation… 320 vidéos"],
    [{ ...base, syncStatus: "syncing" as const, videoCount: 1 }, "Synchronisation… 1 vidéo"],
    [base, "À jour il y a 2 h"],
    [{ ...base, lastSyncedAt: null }, "En attente"],
    [{ ...base, syncStatus: "error" as const, syncError: "YouTube injoignable" }, "Erreur"],
    [{ ...base, syncStatus: "error" as const, syncError: QUOTA_SYNC_ERROR }, QUOTA_SYNC_ERROR],
  ])("%o → %s", (channel, label) => {
    expect(channelStatusLabel(channel, NOW)).toBe(label);
  });
});

describe("performanceBadge", () => {
  it("shows the score with its band, views per day for a recent video, nothing without a score", () => {
    expect(performanceBadge({ kind: "scored", score: 8.5, band: "over" })).toMatchObject({ label: "×8,5", tone: "over", hint: expect.stringContaining("Surperforme") });
    expect(performanceBadge({ kind: "scored", score: 0.4, band: "under" })).toMatchObject({ label: "×0,4", tone: "under", hint: expect.stringContaining("Sous-performe") });
    expect(performanceBadge({ kind: "scored", score: 1.2, band: "neutral" })).toMatchObject({ label: "×1,2", tone: "neutral" });
    expect(performanceBadge({ kind: "recent", viewsPerDay: 850 })).toMatchObject({ label: "Récente · 850 vues/j", tone: "recent" });
    expect(performanceBadge({ kind: "none" })).toBeNull();
  });
});

describe("filters", () => {
  it("labels the type filter", () => {
    expect(typesFilterLabel([])).toBe("Tous les types");
    expect(typesFilterLabel(["versus"])).toBe("Versus / comparaison");
    expect(typesFilterLabel(["none"])).toBe("Non classée");
    expect(typesFilterLabel(["versus", "none"])).toBe("2 types");
  });

  it("toggles a value in a multi-select", () => {
    expect(toggleFilterValue(["a", "b"], "c", true)).toEqual(["a", "b", "c"]);
    expect(toggleFilterValue(["a", "b"], "a", false)).toEqual(["b"]);
    expect(toggleFilterValue(["a"], "a", true)).toEqual(["a"]);
  });
});

describe("channelsDataVersion", () => {
  const data: ChannelsResponse = {
    youtubeConfigured: true,
    channels: [
      {
        id: "c1",
        youtubeChannelId: "UCx",
        title: "C1",
        handle: null,
        avatarUrl: null,
        subscriberCount: null,
        isMine: false,
        medianViews: null,
        lastSyncedAt: null,
        syncStatus: "syncing",
        syncError: null,
        videoCount: 10,
        createdAt: "2026-09-16T00:00:00.000Z",
      },
    ],
    classification: { enabled: true, hasKey: true, pending: 5, awaitingConfirmation: 0, estimatedCostUsd: 0, running: true, modelLabel: "Gemini 2.5 Flash Lite" },
  };

  it("changes with sync progress and classification progress only", () => {
    const version = channelsDataVersion(data);
    expect(channelsDataVersion({ ...data, classification: { ...data.classification, running: false } })).toBe(version);
    expect(channelsDataVersion({ ...data, channels: [{ ...data.channels[0], videoCount: 60 }] })).not.toBe(version);
    expect(channelsDataVersion({ ...data, classification: { ...data.classification, pending: 4 } })).not.toBe(version);
  });
});

describe("why copy", () => {
  it("never claims Studio metrics and labels caption source + hold honestly", () => {
    expect(WHY_DISCLAIMER).toMatch(/pas de CTR/i);
    expect(WHY_DISCLAIMER).toMatch(/médiane/i);
    expect(captionSourceLabel({ status: "ok", kind: "official", language: "fr" })).toBe("Sous-titres officiels (fr)");
    expect(captionSourceLabel({ status: "ok", kind: "asr", language: "en" })).toBe("Sous-titres auto (en)");
    expect(captionSourceLabel({ status: "missing", kind: null, language: null })).toBe(
      "Pas de sous-titres publics — on ne peut pas juger l'accroche parlée",
    );
    expect(captionSourceLabel({ status: "blocked", kind: null, language: null })).toBe(
      "Sous-titres inaccessibles pour le moment",
    );
    expect(holdBandLabel("holds")).toBe("ouverture parlée plutôt retenante");
    expect(holdBandLabel("drops")).toBe("ouverture parlée peu retenante");
    expect(holdBandLabel("unsure")).toBe("ouverture parlée incertaine (Jev ~50/50)");
    expect(
      whyFactsSentence({
        performance: { kind: "scored", score: 3.3, band: "over" },
        channelTitle: "Nate Herk",
        publishedAt: "2026-08-20T12:00:00.000Z",
        viewCount: 12_000,
        now: NOW,
      }),
    ).toBe("Cette vidéo fait ×3,3 vs la médiane de cette chaîne (Nate Herk). Âge : 27 jours. 12 k vues.");
  });
});
