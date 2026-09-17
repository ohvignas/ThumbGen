import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/lib/db";
import * as store from "@/lib/youtube/channel-store";
import { copyVideoThumbnailToLibrary } from "@/lib/youtube/use-thumbnail";
import { createFakeYouTube, type FakeYouTube } from "./fake-youtube";

const DAY = 86_400_000;
let fake: FakeYouTube;

function video(videoId: string) {
  return {
    videoId,
    title: `Vidéo ${videoId}`,
    publishedAt: new Date(Date.now() - 30 * DAY).toISOString(),
    durationSeconds: 600,
    viewCount: 1000,
    likeCount: null,
    thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
    liveBroadcastContent: "none",
  };
}

const countCopies = () => (getDb().prepare("SELECT COUNT(*) AS n FROM swipe_files").get() as { n: number }).n;

beforeEach(() => {
  getDb().exec("DELETE FROM followed_channels");
  const channelId = store.insertChannel(
    { youtubeChannelId: `UC${"u".repeat(22)}`, title: "Chaîne", handle: null, avatarUrl: null, subscriberCount: null, videoCount: null },
    { isMine: false },
  ).channel.id;
  store.upsertVideos(channelId, [video("usethumb001"), video("usethumb002")], new Date().toISOString());
  fake = createFakeYouTube({ thumbnails: { usethumb001: ["hqdefault"] } });
  vi.stubGlobal("fetch", fake.fetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("copyVideoThumbnailToLibrary", () => {
  it("answers unknown-video for a video that is not tracked", async () => {
    expect(await copyVideoThumbnailToLibrary("notTracked1")).toEqual({ status: "unknown-video" });
    expect(fake.fetch).not.toHaveBeenCalled();
  });

  it("creates the library copy once, then reuses it", async () => {
    const first = await copyVideoThumbnailToLibrary("usethumb001");
    expect(first).toEqual({
      status: "created",
      swipeFileId: expect.any(String),
      imageUrl: expect.stringMatching(/^\/api\/swipe-files\/image\?f=/),
      label: "Vidéo usethumb001",
    });
    const downloads = fake.fetch.mock.calls.length;
    const second = await copyVideoThumbnailToLibrary("usethumb001");
    expect(second).toEqual({ ...first, status: "existing" });
    expect(fake.fetch.mock.calls.length).toBe(downloads);
  });

  it("shares one download between concurrent calls", async () => {
    const before = countCopies();
    const [a, b] = await Promise.all([copyVideoThumbnailToLibrary("usethumb001"), copyVideoThumbnailToLibrary("usethumb001")]);
    expect(a.status === "created" && b.status === "created" && a.swipeFileId === b.swipeFileId).toBe(true);
    expect(countCopies()).toBe(before + 1);
  });

  it("copies again when the library copy was deleted", async () => {
    const first = await copyVideoThumbnailToLibrary("usethumb001");
    if (first.status !== "created") throw new Error("expected a copy");
    getDb().prepare("DELETE FROM swipe_files WHERE id = ?").run(first.swipeFileId);
    const again = await copyVideoThumbnailToLibrary("usethumb001");
    expect(again.status).toBe("created");
    expect(again.status === "created" && again.swipeFileId !== first.swipeFileId).toBe(true);
  });

  it("reports a thumbnail YouTube does not serve, and an unreachable YouTube", async () => {
    expect(await copyVideoThumbnailToLibrary("usethumb002")).toEqual({ status: "not-found" });
    fake.setNetworkDown(true);
    expect(await copyVideoThumbnailToLibrary("usethumb001")).toEqual({ status: "unreachable" });
  });
});
