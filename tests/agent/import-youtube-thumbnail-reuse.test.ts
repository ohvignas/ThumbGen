import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/lib/db";
import * as store from "@/lib/youtube/channel-store";
import { copyVideoThumbnailToLibrary } from "@/lib/youtube/use-thumbnail";
import { importYoutubeThumbnailTool } from "@/lib/agent/tools/import-youtube-thumbnail";
import { createFakeYouTube, type FakeYouTube } from "../channels/fake-youtube";

const DAY = 86_400_000;
let fake: FakeYouTube;

const countCopies = () => (getDb().prepare("SELECT COUNT(*) AS n FROM swipe_files").get() as { n: number }).n;
const text = (result: Awaited<ReturnType<typeof importYoutubeThumbnailTool.handler>>) =>
  result.content.flatMap((c) => (c.type === "text" ? [c.text] : [])).join("\n");

beforeEach(() => {
  getDb().exec("DELETE FROM followed_channels");
  const channelId = store.insertChannel(
    { youtubeChannelId: `UC${"i".repeat(22)}`, title: "Chaîne", handle: null, avatarUrl: null, subscriberCount: null, videoCount: null },
    { isMine: true },
  ).channel.id;
  store.upsertVideos(
    channelId,
    [
      {
        videoId: "importvid01",
        title: "Ma meilleure vidéo",
        publishedAt: new Date(Date.now() - 30 * DAY).toISOString(),
        durationSeconds: 600,
        viewCount: 1000,
        likeCount: null,
        thumbnailUrl: "https://i.ytimg.com/vi/importvid01/mqdefault.jpg",
        liveBroadcastContent: "none",
        channelId: `UC${"i".repeat(22)}`,
      },
    ],
    new Date().toISOString(),
  );
  fake = createFakeYouTube({ thumbnails: { importvid01: ["hqdefault"], untracked01: ["hqdefault"], untracked02: ["hqdefault"] } });
  vi.stubGlobal("fetch", fake.fetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("import_youtube_thumbnail reuses « Utiliser comme référence »", () => {
  it("returns the library copy already made from the UI, without downloading", async () => {
    const fromUi = await copyVideoThumbnailToLibrary("importvid01");
    if (fromUi.status !== "created") throw new Error("expected a copy");
    const downloads = fake.fetch.mock.calls.length;

    const result = await importYoutubeThumbnailTool.handler({ video_id: "importvid01" });
    expect(result.isError).toBeFalsy();
    expect(text(result)).toContain(`stored:sf_${fromUi.swipeFileId}`);
    expect(text(result)).toContain('label: "Ma meilleure vidéo"');
    expect(result.content.some((c) => c.type === "image")).toBe(true);
    expect(fake.fetch.mock.calls.length).toBe(downloads);
  });

  it("makes a single library copy when the tool runs twice", async () => {
    const before = countCopies();
    const first = await importYoutubeThumbnailTool.handler({ video_id: "importvid01" });
    const second = await importYoutubeThumbnailTool.handler({ video_id: "importvid01" });
    expect(countCopies()).toBe(before + 1);
    const ref = (value: string) => value.match(/stored:sf_[\w-]+/)?.[0];
    expect(ref(text(first))).toBe(ref(text(second)));
    expect(store.getVideo("importvid01")?.swipe_file_id).toBe(ref(text(first))?.slice("stored:sf_".length));
  });

  it("keeps importing untracked videos as before", async () => {
    const before = countCopies();
    const result = await importYoutubeThumbnailTool.handler({ video_id: "untracked01", label: "Réf" });
    expect(result.isError).toBeFalsy();
    expect(text(result)).toMatch(/stored:sf_[\w-]+/);
    expect(countCopies()).toBe(before + 1);
  });

  it("stores one library copy when the same untracked video is imported twice", async () => {
    const before = countCopies();
    const first = await importYoutubeThumbnailTool.handler({ video_id: "untracked02", label: "Réf" });
    const downloads = fake.fetch.mock.calls.length;
    const second = await importYoutubeThumbnailTool.handler({ video_id: "untracked02", label: "Réf" });
    expect(countCopies()).toBe(before + 1);
    const ref = (value: string) => value.match(/stored:sf_[\w-]+/)?.[0];
    expect(ref(text(first))).toBe(ref(text(second)));
    expect(fake.fetch.mock.calls.length).toBe(downloads);
  });

  it("reports a tracked video whose thumbnail is missing as an error", async () => {
    fake.setNetworkDown(true);
    const result = await importYoutubeThumbnailTool.handler({ video_id: "importvid01" });
    expect(result.isError).toBe(true);
  });
});
