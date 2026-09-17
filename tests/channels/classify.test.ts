import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/lib/db";
import { logGeneration } from "@/lib/generations-log";
import { getTypedSettings, setSetting } from "@/lib/settings";
import * as store from "@/lib/youtube/channel-store";
import { CLASSIFY_MODEL } from "@/lib/youtube/classification-pricing";
import {
  buildClassificationStatus,
  classifyVideo,
  runClassificationQueue,
  type ClassificationDeps,
  type ClassifierClient,
} from "@/lib/youtube/classify";
import { acquireChannelLock, releaseChannelLock, resetChannelRuntime } from "@/lib/youtube/runtime";

type CreateArgs = {
  model: string;
  response_format: unknown;
  messages: Array<{ role: string; content: unknown }>;
};

function fakeClient(answer: (videoId: string) => unknown) {
  const create = vi.fn(async (args: CreateArgs) => {
    const user = args.messages.find((message) => message.role === "user");
    const parts = user?.content as Array<{ type: string; image_url?: { url: string } }>;
    const imageUrl = parts.find((part) => part.type === "image_url")?.image_url?.url ?? "";
    // https://i.ytimg.com/vi/<videoId>/mqdefault.jpg
    return answer(imageUrl.split("/")[4] ?? "");
  });
  return { client: { chat: { completions: { create } } } as unknown as ClassifierClient, create };
}

const completion = (
  content: string,
  usage: Record<string, number> = { prompt_tokens: 600, completion_tokens: 8, total_tokens: 608, cost: 0.0000632 },
) => ({ choices: [{ message: { content } }], usage });

const deps = (client: ClassifierClient | null, enabled = true): ClassificationDeps => ({
  getClient: () => client,
  isEnabled: () => enabled,
});

let channelId: string;

function seedVideos(videoIds: string[]) {
  store.upsertVideos(
    channelId,
    videoIds.map((videoId, index) => ({
      videoId,
      title: `Vidéo ${videoId}`,
      publishedAt: new Date(Date.UTC(2026, 0, 1 + index)).toISOString(),
      durationSeconds: 600,
      viewCount: 10,
      likeCount: null,
      thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
      liveBroadcastContent: "none",
    })),
    "2026-09-01T00:00:00.000Z",
  );
}

const classifyLogs = () =>
  getDb()
    .prepare(
      `SELECT model, endpoint, status, cost_estimate, input_tokens, output_tokens, image_count
       FROM generations_log WHERE endpoint = 'classify-thumbnail' ORDER BY created_at`,
    )
    .all();

beforeEach(() => {
  const db = getDb();
  db.exec("DELETE FROM followed_channels");
  db.exec("DELETE FROM generations_log");
  db.exec("DELETE FROM settings");
  resetChannelRuntime();
  channelId = store.insertChannel({
    youtubeChannelId: `UC${"k".repeat(22)}`,
    title: "Classement",
    handle: null,
    avatarUrl: null,
    subscriberCount: null,
    videoCount: null,
  }).channel.id;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("inspirationAutoClassify setting", () => {
  it("is on by default and can be turned off", () => {
    expect(getTypedSettings().inspirationAutoClassify).toBe(true);
    setSetting("inspirationAutoClassify", "false");
    expect(getTypedSettings().inspirationAutoClassify).toBe(false);
  });
});

describe("logGeneration", () => {
  it("stores a token-priced cost for a thumbnail classification", () => {
    logGeneration({ provider: "openrouter", model: CLASSIFY_MODEL, endpoint: "classify-thumbnail", timeMs: 5, imageCount: 0, costEstimate: 0.00007 });
    expect(classifyLogs()).toEqual([
      { model: CLASSIFY_MODEL, endpoint: "classify-thumbnail", status: "success", cost_estimate: 0.00007, input_tokens: 0, output_tokens: 0, image_count: 0 },
    ]);
  });
});

describe("classifyVideo", () => {
  it("asks the vision model for one type with a JSON schema, stores it and logs the cost", async () => {
    seedVideos(["vid00000001"]);
    const { client, create } = fakeClient(() => completion('{"type":"before_after"}'));

    expect(await classifyVideo(client, "vid00000001")).toBe("classified");

    const args = create.mock.calls[0][0];
    expect(args.model).toBe("google/gemini-2.5-flash-lite");
    expect(args.response_format).toMatchObject({ type: "json_schema", json_schema: { name: "thumbnail_type", strict: true } });
    expect(JSON.stringify(args.messages)).toContain("https://i.ytimg.com/vi/vid00000001/mqdefault.jpg");
    expect((create.mock.calls[0] as unknown[])[1]).toEqual({ timeout: 30_000, maxRetries: 0 });
    expect(store.getVideo("vid00000001")).toMatchObject({ thumb_type: "before_after", thumb_type_source: "ai" });
    expect(classifyLogs()).toEqual([
      { model: CLASSIFY_MODEL, endpoint: "classify-thumbnail", status: "success", cost_estimate: 0.0000632, input_tokens: 600, output_tokens: 8, image_count: 0 },
    ]);
  });

  it("files an invalid answer under « other »", async () => {
    seedVideos(["vid00000001", "vid00000002"]);
    const { client } = fakeClient((videoId) => completion(videoId === "vid00000001" ? '{"type":"banana"}' : "pas du JSON"));

    await classifyVideo(client, "vid00000001");
    await classifyVideo(client, "vid00000002");

    expect(store.getVideo("vid00000001")?.thumb_type).toBe("other");
    expect(store.getVideo("vid00000002")?.thumb_type).toBe("other");
  });

  it("prices the call from its tokens when OpenRouter sends no cost", async () => {
    seedVideos(["vid00000001"]);
    const { client } = fakeClient(() => completion('{"type":"scene"}', { prompt_tokens: 1_000_000, completion_tokens: 0, total_tokens: 1_000_000 }));

    await classifyVideo(client, "vid00000001");

    expect((classifyLogs()[0] as { cost_estimate: number }).cost_estimate).toBeCloseTo(0.1);
  });

  it("leaves a failed thumbnail unclassified and counts the attempt", async () => {
    seedVideos(["vid00000001"]);
    const { client } = fakeClient(() => {
      throw new Error("OpenRouter 502");
    });

    expect(await classifyVideo(client, "vid00000001")).toBe("failed");

    expect(store.getVideo("vid00000001")).toMatchObject({ thumb_type: null, thumb_type_source: null, classify_attempts: 1 });
    expect(classifyLogs()).toMatchObject([{ status: "error", cost_estimate: 0 }]);
  });

  it("never overwrites a type corrected by hand while the model was answering", async () => {
    seedVideos(["vid00000001"]);
    const { client } = fakeClient(() => {
      store.setManualThumbType("vid00000001", "versus");
      return completion('{"type":"scene"}');
    });

    await classifyVideo(client, "vid00000001");

    expect(store.getVideo("vid00000001")).toMatchObject({ thumb_type: "versus", thumb_type_source: "manual" });
  });
});

describe("runClassificationQueue", () => {
  it("classifies every pending thumbnail and skips manual ones", async () => {
    seedVideos(["vid00000001", "vid00000002", "vid00000003"]);
    store.setManualThumbType("vid00000002", "text_only");
    const { client, create } = fakeClient(() => completion('{"type":"face_text"}'));

    expect(await runClassificationQueue(deps(client))).toEqual({ classified: 2, failed: 0 });

    expect(create).toHaveBeenCalledTimes(2);
    expect(store.getVideo("vid00000002")).toMatchObject({ thumb_type: "text_only", thumb_type_source: "manual" });
  });

  it("retries a failed thumbnail on later runs only, 3 times at most", async () => {
    seedVideos(["vid00000001"]);
    const { client, create } = fakeClient(() => {
      throw new Error("boom");
    });

    expect(await runClassificationQueue(deps(client))).toEqual({ classified: 0, failed: 1 });
    expect(create).toHaveBeenCalledTimes(1);
    await runClassificationQueue(deps(client));
    await runClassificationQueue(deps(client));
    expect(await runClassificationQueue(deps(client))).toEqual({ classified: 0, failed: 0 });
    expect(create).toHaveBeenCalledTimes(3);
  });

  it("does nothing when the setting is off or without an OpenRouter key", async () => {
    seedVideos(["vid00000001"]);
    const { client, create } = fakeClient(() => completion('{"type":"scene"}'));

    expect(await runClassificationQueue(deps(client, false))).toEqual({ classified: 0, failed: 0 });
    expect(await runClassificationQueue(deps(null))).toEqual({ classified: 0, failed: 0 });
    expect(create).not.toHaveBeenCalled();
  });

  it("waits for confirmation above 200 thumbnails, then classifies them all", async () => {
    seedVideos(Array.from({ length: 201 }, (_, index) => `big${String(index).padStart(8, "0")}`));
    const { client, create } = fakeClient(() => completion('{"type":"object"}'));

    expect(await runClassificationQueue(deps(client))).toEqual({ classified: 0, failed: 0 });
    expect(create).not.toHaveBeenCalled();
    const status = buildClassificationStatus(false, deps(client));
    expect(status).toMatchObject({ enabled: true, hasKey: true, pending: 201, awaitingConfirmation: 201, running: false, modelLabel: "Gemini 2.5 Flash Lite" });
    expect(status.estimatedCostUsd).toBeCloseTo(201 * 0.000078, 8);

    expect(store.approvePendingClassification()).toBe(201);
    expect(await runClassificationQueue(deps(client))).toEqual({ classified: 201, failed: 0 });
    expect(buildClassificationStatus(false, deps(client))).toMatchObject({ pending: 0, awaitingConfirmation: 0, estimatedCostUsd: 0 });
  });

  it("starts a batch of 200 or fewer without asking", async () => {
    seedVideos(Array.from({ length: 200 }, (_, index) => `ok${String(index).padStart(9, "0")}`));
    const { client } = fakeClient(() => completion('{"type":"object"}'));

    expect(buildClassificationStatus(false, deps(client)).awaitingConfirmation).toBe(0);
    expect(await runClassificationQueue(deps(client))).toEqual({ classified: 200, failed: 0 });
  });

  it("never approves on its own while a channel import is still running, then does once it is done", async () => {
    seedVideos(Array.from({ length: 50 }, (_, index) => `run${String(index).padStart(8, "0")}`));
    const { client, create } = fakeClient(() => completion('{"type":"object"}'));
    expect(acquireChannelLock("importing-channel")).toBe(true);

    expect(await runClassificationQueue(deps(client))).toEqual({ classified: 0, failed: 0 });
    expect(create).not.toHaveBeenCalled();
    expect(store.countPendingClassification()).toEqual({ pending: 50, unapproved: 50 });

    releaseChannelLock("importing-channel");
    expect(await runClassificationQueue(deps(client))).toEqual({ classified: 50, failed: 0 });
  });
});
