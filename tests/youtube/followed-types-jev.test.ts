import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listFollowedVideosTool } from "@/lib/agent/tools/list-followed-videos";
import { getDb } from "@/lib/db";
import { setSetting } from "@/lib/settings";
import * as store from "@/lib/youtube/channel-store";
import type { ThumbType } from "@/lib/youtube/thumb-types";
import { typesSummary } from "@/lib/youtube/video-queries";

const NOW = new Date("2026-09-19T12:00:00.000Z");
const fetchMock = vi.fn<typeof fetch>();
let savedEnv: string | undefined;

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 86_400_000).toISOString();
}

function addVideo(channelId: string, videoId: string, days: number, views: number, type: ThumbType, title: string) {
  store.upsertVideos(
    channelId,
    [
      {
        videoId,
        title,
        publishedAt: daysAgo(days),
        durationSeconds: 600,
        viewCount: views,
        likeCount: null,
        thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
        liveBroadcastContent: "none",
      },
    ],
    NOW.toISOString(),
  );
  store.setAiThumbType(videoId, type);
}

function seedCloseTypes() {
  const mine = store.insertChannel(
    {
      youtubeChannelId: `UC${"j".repeat(22)}`,
      title: "Ma chaîne",
      handle: null,
      avatarUrl: null,
      subscriberCount: null,
      videoCount: null,
    },
    { isMine: true },
  ).channel.id;
  store.finishSync(mine, { medianViews: 1_000, syncedAt: NOW.toISOString() });
  addVideo(mine, "face0000001", 21, 3_000, "face_text", "Face A");
  addVideo(mine, "face0000002", 21, 3_000, "face_text", "Face B");
  addVideo(mine, "face0000003", 21, 3_000, "face_text", "Face C");
  addVideo(mine, "reac0000001", 21, 2_800, "reaction", "Click A");
  addVideo(mine, "reac0000002", 21, 2_800, "reaction", "Click B");
  addVideo(mine, "reac0000003", 21, 2_800, "reaction", "Click C");
  return mine;
}

function seedBestThumb() {
  const mine = store.insertChannel(
    {
      youtubeChannelId: `UC${"k".repeat(22)}`,
      title: "Ma chaîne",
      handle: null,
      avatarUrl: null,
      subscriberCount: null,
      videoCount: null,
    },
    { isMine: true },
  ).channel.id;
  store.finishSync(mine, { medianViews: 1_000, syncedAt: NOW.toISOString() });
  addVideo(mine, "best0000001", 21, 4_000, "face_text", "Cursor faible");
  addVideo(mine, "best0000002", 21, 3_200, "face_text", "Cursor cliquant");
  addVideo(mine, "best0000003", 21, 3_000, "face_text", "Cursor autre");
}

function typeSafeAnswers(nouls: Record<string, number>): Response {
  const answers = Object.fromEntries(
    Object.entries(nouls).map(([id, noul]) => [id, { type: "noul" as const, noul }]),
  );
  return new Response(JSON.stringify({ answers }), { status: 200, headers: { "content-type": "application/json" } });
}

function requestBody(): Record<string, unknown> {
  return JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.body)) as Record<string, unknown>;
}

beforeEach(() => {
  getDb().exec("DELETE FROM followed_channels");
  getDb().exec("DELETE FROM settings");
  savedEnv = process.env.TYPESAFE_API_KEY;
  delete process.env.TYPESAFE_API_KEY;
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (savedEnv === undefined) delete process.env.TYPESAFE_API_KEY;
  else process.env.TYPESAFE_API_KEY = savedEnv;
});

describe("followed analysis Jev", () => {
  it("keeps the numeric type order without a TypeSafe key", async () => {
    seedCloseTypes();
    const { rows, jevUsed } = await typesSummary("mine", NOW);
    expect(jevUsed).toBe(false);
    expect(rows.map((row) => row.label.toLowerCase())).toEqual(["face", "click"]);
    expect(rows[0]?.winner?.videoId).toBe("face0000001");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends titles only and lets Jev promote the weaker type", async () => {
    seedCloseTypes();
    setSetting("typesafeApiKey", "tsk-test");
    fetchMock.mockResolvedValue(
      typeSafeAnswers({
        click_0: 0.05,
        click_1: 0.05,
        click_2: 0.05,
        click_3: 0.99,
        click_4: 0.99,
        click_5: 0.99,
      }),
    );

    const { rows, jevUsed } = await typesSummary("mine", NOW);
    expect(jevUsed).toBe(true);
    expect(rows.map((row) => row.label.toLowerCase())).toEqual(["click", "face"]);
    expect(rows[0]?.medianScore).toBe(2.8);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("https://api.typesafe.ai/v1/systemone");
    const body = requestBody();
    expect(body.model).toBe("jev-latest");
    expect(body.state).toEqual({
      query: "Ma chaîne",
      titles: {
        click_0: "Face A",
        click_1: "Face B",
        click_2: "Face C",
        click_3: "Click A",
        click_4: "Click B",
        click_5: "Click C",
      },
    });
    expect(JSON.stringify(body)).not.toMatch(/https?:|thumbnail|mqdefault|\.jpg|image\//i);
    expect(JSON.stringify(body.questions)).toContain("followed YouTube");
  });

  it("falls back to swipe rank when TypeSafe fails", async () => {
    seedCloseTypes();
    setSetting("typesafeApiKey", "tsk-test");
    fetchMock.mockRejectedValue(new Error("TypeSafe down"));
    const { rows, jevUsed } = await typesSummary("mine", NOW);
    expect(jevUsed).toBe(false);
    expect(rows.map((row) => row.label.toLowerCase())).toEqual(["face", "click"]);
  });

  it("lets Jev pick a more clickable best thumb of the same type", async () => {
    seedBestThumb();
    setSetting("typesafeApiKey", "tsk-test");
    fetchMock.mockResolvedValue(typeSafeAnswers({ click_0: 0.05, click_1: 0.99, click_2: 0.4 }));
    const { rows, jevUsed } = await typesSummary("mine", NOW);
    expect(jevUsed).toBe(true);
    expect(rows[0]?.winner).toMatchObject({ videoId: "best0000002", title: "Cursor cliquant", score: 3.2 });
  });

  it("feeds the Jev theme order to list_followed_videos best_type", async () => {
    seedCloseTypes();
    setSetting("typesafeApiKey", "tsk-test");
    fetchMock.mockResolvedValue(
      typeSafeAnswers({
        click_0: 0.05,
        click_1: 0.05,
        click_2: 0.05,
        click_3: 0.99,
        click_4: 0.99,
        click_5: 0.99,
      }),
    );
    const result = await listFollowedVideosTool.handler(
      listFollowedVideosTool.inputSchema.parse({ scope: "mine", sort: "score", best_type: true, limit: 12 }),
    );
    const text = result.content.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("\n");
    expect(text).toContain("thème Click");
    expect(text).toContain("youtube:reac0000001");
    expect(text).not.toContain("youtube:face0000001");
  });
});
