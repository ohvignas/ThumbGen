import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("youtube-transcript", () => ({
  YoutubeTranscript: { fetchTranscript: vi.fn(async () => []) },
}));

import "@/lib/agent/tools/all";
import { getTool } from "@/lib/agent/tools";
import { buildMcpServer } from "@/lib/agent/mcp/server";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { getDb } from "@/lib/db";
import * as store from "@/lib/youtube/channel-store";
import { listFollowedVideosTool } from "@/lib/agent/tools/list-followed-videos";
import { TOOL_LABELS } from "@/lib/agent/tool-labels";

const DAY = 86_400_000;
let savedTypesafeEnv: string | undefined;
const fetchSpy = vi.fn(async () => {
  throw new Error("no network in tests");
});

function video(videoId: string, days: number, viewCount: number, title = `Titre ${videoId}`) {
  return {
    videoId,
    title,
    publishedAt: new Date(Date.now() - days * DAY).toISOString(),
    durationSeconds: 600,
    viewCount,
    likeCount: null,
    thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
    liveBroadcastContent: "none",
  };
}

function channel(letter: string, title: string, isMine: boolean) {
  const id = store.insertChannel(
    { youtubeChannelId: `UC${letter.repeat(22)}`, title, handle: null, avatarUrl: null, subscriberCount: null, videoCount: null },
    { isMine },
  ).channel.id;
  store.finishSync(id, { medianViews: 1000, syncedAt: new Date().toISOString() });
  return id;
}

const run = async (input: Record<string, unknown>) => {
  const parsed = listFollowedVideosTool.inputSchema.parse(input);
  const result = await listFollowedVideosTool.handler(parsed);
  return { result, text: result.content.flatMap((c) => (c.type === "text" ? [c.text] : [])).join("\n") };
};
const ids = (text: string) => [...text.matchAll(/youtube:([\w-]+)/g)].map((m) => m[1]);

beforeEach(() => {
  getDb().exec("DELETE FROM followed_channels");
  getDb().exec("DELETE FROM settings");
  savedTypesafeEnv = process.env.TYPESAFE_API_KEY;
  delete process.env.TYPESAFE_API_KEY;
  vi.stubGlobal("fetch", fetchSpy);
  fetchSpy.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (savedTypesafeEnv === undefined) delete process.env.TYPESAFE_API_KEY;
  else process.env.TYPESAFE_API_KEY = savedTypesafeEnv;
});

function seed() {
  const mine = channel("m", "Ma chaîne", true);
  const other = channel("o", "Concurrent", false);
  store.upsertVideos(
    mine,
    [
      video("mine0000001", 10, 900, "iPhone 17 A"),
      video("mine0000002", 20, 4000, "Cursor 2.0 A"),
      video("mine0000003", 30, 2000, "Cursor 2.0 B"),
      video("mine0000004", 40, 500, "iPhone 17 B"),
    ],
    new Date().toISOString(),
  );
  store.upsertVideos(
    other,
    [video("othr0000001", 15, 9000, "Cursor 2.0 C"), video("othr0000002", 25, 300, "iPhone 17 C")],
    new Date().toISOString(),
  );
  for (const id of ["mine0000002", "mine0000003", "othr0000001"]) store.setAiThumbType(id, "face_text");
  for (const id of ["mine0000001", "mine0000004", "othr0000002"]) store.setAiThumbType(id, "text_only");
}

describe("list_followed_videos", () => {
  it("lists « Ma chaîne » newest first, with refs, titles and performance", async () => {
    seed();
    const { result, text } = await run({ scope: "mine", sort: "date", limit: 3 });
    expect(result.isError).toBeFalsy();
    expect(ids(text)).toEqual(["mine0000001", "mine0000002", "mine0000003"]);
    expect(text).toContain('"Cursor 2.0 A"');
    expect(text).toContain("perf: ×4");
    expect(text).toContain("type: Visage + texte");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("defaults to my channel, by date, 5 videos", async () => {
    seed();
    const { text } = await run({});
    expect(ids(text)).toEqual(["mine0000001", "mine0000002", "mine0000003", "mine0000004"]);
  });

  it("sorts every followed channel by performance", async () => {
    seed();
    const { text } = await run({ scope: "all", sort: "score", limit: 3 });
    expect(ids(text)).toEqual(["othr0000001", "mine0000002", "mine0000003"]);
  });

  it("keeps only the winning title/description theme", async () => {
    seed();
    const { text } = await run({ scope: "all", sort: "score", best_type: true, limit: 12 });
    expect(text).toContain("thème Cursor 2.0");
    expect(text).toContain("pourquoi:");
    expect(ids(text).sort()).toEqual(["mine0000002", "mine0000003", "othr0000001"]);
  });

  it("says when there is not enough data for a winning theme", async () => {
    seed();
    const { text } = await run({ scope: "mine", sort: "score", best_type: true });
    expect(text).toContain("pas assez de données pour une meilleure thématique");
    expect(ids(text)).toHaveLength(4);
  });

  it("does not elect Autres sujets as best_type", async () => {
    const mine = channel("z", "Ma chaîne", true);
    store.upsertVideos(
      mine,
      [
        video("lone0000001", 10, 5000, "Tarte aux pommes"),
        video("lone0000002", 20, 4000, "Étagère murale"),
        video("lone0000003", 30, 9000, "Voyage à Kyoto"),
      ],
      new Date().toISOString(),
    );
    const { text } = await run({ scope: "mine", sort: "score", best_type: true });
    expect(text).toContain("pas assez de données pour une meilleure thématique");
    expect(text).not.toContain("thème Autres sujets");
    expect(ids(text).sort()).toEqual(["lone0000001", "lone0000002", "lone0000003"]);
  });

  it("covers every channel marked « Ma chaîne », like the types summary", async () => {
    seed();
    const second = channel("s", "Ma deuxième chaîne", true);
    store.upsertVideos(second, [video("seco0000001", 5, 100)], new Date().toISOString());
    const { text } = await run({ scope: "mine", sort: "date", limit: 12 });
    expect(ids(text)).toEqual(["seco0000001", "mine0000001", "mine0000002", "mine0000003", "mine0000004"]);
    expect(ids(text)).not.toContain("othr0000001");
  });

  it("answers without error when no channel is « Ma chaîne »", async () => {
    channel("o", "Concurrent", false);
    const { result, text } = await run({ scope: "mine" });
    expect(result.isError).toBeFalsy();
    expect(text).toContain("Ma chaîne");
    expect(ids(text)).toEqual([]);
  });

  it("caps the limit at 12", () => {
    expect(listFollowedVideosTool.inputSchema.safeParse({ limit: 12 }).success).toBe(true);
    expect(listFollowedVideosTool.inputSchema.safeParse({ limit: 13 }).success).toBe(false);
    expect(listFollowedVideosTool.inputSchema.safeParse({ limit: 0 }).success).toBe(false);
  });

  it("is a chat-only registry tool with a label, hidden from MCP", async () => {
    expect(getTool("list_followed_videos")?.chatOnly).toBe(true);
    expect(TOOL_LABELS.list_followed_videos).toBe("Liste les vidéos suivies");
    const server = buildMcpServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new Client({ name: "test-client", version: "1.0.0" });
    await client.connect(clientTransport);
    expect((await client.listTools()).tools.map((tool) => tool.name)).not.toContain("list_followed_videos");
  });
});
