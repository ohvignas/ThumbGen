import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as typesSummaryRoute } from "@/app/api/channels/types-summary/route";
import { GET as workingSubjectRoute } from "@/app/api/channels/working-subject/route";
import { PATCH as setVideoType } from "@/app/api/channels/videos/[videoId]/route";
import { POST as useVideo } from "@/app/api/channels/videos/[videoId]/use/route";
import { GET as listVideosRoute } from "@/app/api/channels/videos/route";
import { getDb } from "@/lib/db";
import * as store from "@/lib/youtube/channel-store";
import { getSwipeFileTitle } from "@/lib/youtube/thumbnails";
import type { TypesSummaryResponse, UseVideoResponse, VideoListResponse, WorkingSubjectResponse } from "@/lib/youtube/types";
import { createFakeYouTube, type FakeYouTube } from "./fake-youtube";

const DAY = 86_400_000;
let fake: FakeYouTube;
let savedTypesafeEnv: string | undefined;

const videoParams = (videoId: string) => ({ params: Promise.resolve({ videoId }) });
const patch = (videoId: string, body: unknown) =>
  new Request(`http://localhost/api/channels/videos/${videoId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const use = (videoId: string, contentType = "application/json") =>
  new Request(`http://localhost/api/channels/videos/${videoId}/use`, { method: "POST", headers: { "content-type": contentType } });

function video(videoId: string, days: number, viewCount: number) {
  return {
    videoId,
    title: `Vidéo ${videoId}`,
    publishedAt: new Date(Date.now() - days * DAY).toISOString(),
    durationSeconds: 600,
    viewCount,
    likeCount: null,
    thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
    liveBroadcastContent: "none",
  };
}

beforeEach(() => {
  getDb().exec("DELETE FROM followed_channels");
  getDb().exec("DELETE FROM settings");
  savedTypesafeEnv = process.env.TYPESAFE_API_KEY;
  delete process.env.TYPESAFE_API_KEY;
  const channelId = store.insertChannel(
    { youtubeChannelId: `UC${"w".repeat(22)}`, title: "Ma chaîne", handle: null, avatarUrl: null, subscriberCount: null, videoCount: null },
    { isMine: true },
  ).channel.id;
  store.finishSync(channelId, { medianViews: 1000, syncedAt: new Date().toISOString() });
  store.upsertVideos(channelId, [video("routevid001", 30, 5000), video("routevid002", 60, 800), video("routevid003", 90, 3000)], new Date().toISOString());
  store.setAiThumbType("routevid001", "face_text");
  fake = createFakeYouTube({ thumbnails: { routevid001: ["hqdefault", "mqdefault"] } });
  vi.stubGlobal("fetch", fake.fetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (savedTypesafeEnv === undefined) delete process.env.TYPESAFE_API_KEY;
  else process.env.TYPESAFE_API_KEY = savedTypesafeEnv;
});

describe("GET /api/channels/videos", () => {
  it("applies filters, sort and page window from the query string", async () => {
    const res = listVideosRoute(new Request("http://localhost/api/channels/videos?sort=views&types=face_text,none&limit=2"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as VideoListResponse;
    expect(body.total).toBe(3);
    expect(body.limit).toBe(2);
    expect(body.items.map((item) => item.videoId)).toEqual(["routevid001", "routevid003"]);
  });

  it("falls back to the defaults on unknown values", async () => {
    const res = listVideosRoute(new Request("http://localhost/api/channels/videos?sort=bogus&period=forever&limit=abc"));
    const body = (await res.json()) as VideoListResponse;
    expect(body.limit).toBe(60);
    expect(body.items.map((item) => item.videoId)).toEqual(["routevid001", "routevid003", "routevid002"]);
  });
});

describe("PATCH /api/channels/videos/[videoId]", () => {
  it("stores a manual type", async () => {
    const res = await setVideoType(patch("routevid001", { thumbType: "versus" }), videoParams("routevid001"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ videoId: "routevid001", thumbType: "versus", thumbTypeSource: "manual" });
    expect(store.getVideo("routevid001")).toMatchObject({ thumb_type: "versus", thumb_type_source: "manual" });
  });

  it("rejects an unknown type or video", async () => {
    expect((await setVideoType(patch("routevid001", { thumbType: "banana" }), videoParams("routevid001"))).status).toBe(400);
    expect((await setVideoType(patch("nope", { thumbType: "versus" }), videoParams("nope"))).status).toBe(404);
  });
});

describe("POST /api/channels/videos/[videoId]/use", () => {
  it("copies the best thumbnail into the library once, titled like the video", async () => {
    const first = await useVideo(use("routevid001"), videoParams("routevid001"));
    expect(first.status).toBe(201);
    const copy = (await first.json()) as UseVideoResponse;
    expect(copy).toEqual({
      swipeFileId: expect.any(String),
      imageUrl: `/api/swipe-files/image?f=${copy.swipeFileId}`,
      label: "Vidéo routevid001",
    });
    expect(getSwipeFileTitle(copy.swipeFileId)).toBe("Vidéo routevid001");
    expect(store.getVideo("routevid001")?.swipe_file_id).toBe(copy.swipeFileId);

    const downloads = fake.fetch.mock.calls.length;
    const second = await useVideo(use("routevid001"), videoParams("routevid001"));
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual(copy);
    expect(fake.fetch.mock.calls.length).toBe(downloads);
  });

  it("makes a single copy when the same video is used twice at the same time", async () => {
    const countCopies = () => (getDb().prepare("SELECT COUNT(*) AS n FROM swipe_files").get() as { n: number }).n;
    const before = countCopies();
    const [first, second] = await Promise.all([
      useVideo(use("routevid001"), videoParams("routevid001")),
      useVideo(use("routevid001"), videoParams("routevid001")),
    ]);
    const bodies = [(await first.json()) as UseVideoResponse, (await second.json()) as UseVideoResponse];
    expect(bodies[0].swipeFileId).toBe(bodies[1].swipeFileId);
    expect(countCopies()).toBe(before + 1);
    expect(store.getVideo("routevid001")?.swipe_file_id).toBe(bodies[0].swipeFileId);
  });

  it("refuses a request that is not declared as JSON", async () => {
    expect((await useVideo(use("routevid001", "text/plain"), videoParams("routevid001"))).status).toBe(415);
    expect(fake.fetch).not.toHaveBeenCalled();
  });

  it("answers 404 for an unknown video or a thumbnail YouTube does not serve", async () => {
    expect((await useVideo(use("nope"), videoParams("nope"))).status).toBe(404);
    const missing = await useVideo(use("routevid002"), videoParams("routevid002"));
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: "Miniature introuvable sur YouTube" });
  });
});

describe("GET /api/channels/working-subject", () => {
  it("always uses the 7-day rising window and never pads", async () => {
    const res = await workingSubjectRoute();
    expect(res.status).toBe(200);
    const body = (await res.json()) as WorkingSubjectResponse;
    expect(body.period).toBe("7d");
    expect(body.jevUsed).toBe(false);
    expect(body.videos.length).toBeLessThanOrEqual(4);
    expect(body.subject).toBeNull();
  });
});

describe("GET /api/channels/types-summary", () => {
  it("summarizes the requested scope", async () => {
    store.setAiThumbType("routevid002", "face_text");
    store.setAiThumbType("routevid003", "face_text");

    const mine = (await (
      await typesSummaryRoute(new Request("http://localhost/api/channels/types-summary?scope=mine"))
    ).json()) as TypesSummaryResponse;
    expect(mine.rows).toMatchObject([
      { themeId: "autres-sujets", totalCount: 3, scoredCount: 3, enoughData: false, winner: null, medianScore: null },
    ]);
    expect(mine.jevUsed).toBe(false);

    const unknown = (await (
      await typesSummaryRoute(new Request("http://localhost/api/channels/types-summary?scope=unknown"))
    ).json()) as TypesSummaryResponse;
    expect(unknown).toEqual({ rows: [], jevUsed: false });
  });
});
