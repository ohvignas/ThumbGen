import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("youtube-transcript", () => ({
  YoutubeTranscript: { fetchTranscript: vi.fn(async () => []) },
}));

vi.mock("@/lib/agent/conversation/store", () => ({
  appendMessage: vi.fn(),
  listMessages: vi.fn(() => []),
  getConversation: (id: string) => ({ id, project_id: "p1", title: "t", created_at: "", updated_at: "" }),
}));
vi.mock("@/lib/agent/v2/persist-turn", () => ({ persistAssistantTurn: vi.fn() }));
vi.mock("@/lib/agent/conversation/auto-title", () => ({ generateAndPersistTitle: vi.fn(async () => {}) }));

const resolveCanvasImageToJpegMock = vi.fn(async (value: string) =>
  value.startsWith("stored:") ? { mediaType: "image/jpeg" as const, data: `jpeg:${value}` } : null,
);
vi.mock("@/lib/agent/tools/_helpers/canvas-image-pixels", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/agent/tools/_helpers/canvas-image-pixels")>();
  return {
    ...actual,
    resolveCanvasImageToJpeg: (value: string) => resolveCanvasImageToJpegMock(value),
  };
});

const streamTextMock = vi.fn();
vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return { ...actual, streamText: (opts: unknown) => streamTextMock(opts) };
});

import { setSetting } from "@/lib/settings";
import { postV2 } from "@/lib/agent/v2/route-handler";
import { resetRunRegistry } from "@/lib/agent/v2/run-registry";
import { chatRequest, fakeStreamResult, waitForRunEnd } from "./helpers/chat-route";

type UserFilePart = { type: "file"; mediaType: string; data: string };
type UserTextPart = { type: "text"; text: string };
type StreamCall = {
  system: string;
  messages: Array<{ role: string; content: Array<UserTextPart | UserFilePart> }>;
};

const lastCall = () => streamTextMock.mock.calls.at(-1)![0] as StreamCall;
const lastSystem = () => lastCall().system;
const lastUserParts = () => lastCall().messages.findLast((m) => m.role === "user")?.content ?? [];
const lastUserFiles = () => lastUserParts().filter((p): p is UserFilePart => p.type === "file");

const PREVIEW_SNAPSHOT = {
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
    {
      id: "gen",
      type: "generator",
      summary: {
        selectedImage: "stored:gi_hist",
        images: [{ visibleId: "#HIST", image: "stored:gi_hist" }],
      },
    },
  ],
  edges: [],
  currentThumbnails: [{ visibleId: "#P1", image: "stored:gi_p1", imageNode: "prev" }],
};

describe("chat route — @ thumbnail mentions", () => {
  let fake: ReturnType<typeof fakeStreamResult>;

  beforeEach(() => {
    resetRunRegistry();
    setSetting("openrouterApiKey", "test-key");
    fake = fakeStreamResult();
    streamTextMock.mockReset();
    streamTextMock.mockImplementation(() => fake);
    resolveCanvasImageToJpegMock.mockClear();
    resolveCanvasImageToJpegMock.mockImplementation(async (value: string) =>
      value.startsWith("stored:") ? { mediaType: "image/jpeg" as const, data: `jpeg:${value}` } : null,
    );
  });

  afterEach(() => {
    setSetting("openrouterApiKey", "");
  });

  it("injects mentioned_images from @#id plus the client list, resolved against the snapshot", async () => {
    await postV2(
      chatRequest({
        conversation_id: "c-mention",
        messages: [{ role: "user", parts: [{ type: "text", text: "améliore @#P1" }] }],
        canvas_snapshot: PREVIEW_SNAPSHOT,
        mentioned_images: [{ visibleId: "#P1", image: "stored:gi_p1", imageNode: "prev", label: "Nano #1" }],
      }),
    );
    expect(lastSystem()).toContain("<mentioned_images>");
    expect(lastSystem()).toContain("#P1");
    expect(lastSystem()).toContain("stored:gi_p1");
    expect(lastSystem()).toContain("visibleId");
    expect(lastUserFiles()).toEqual([{ type: "file", mediaType: "image/jpeg", data: "jpeg:stored:gi_p1" }]);
    expect(resolveCanvasImageToJpegMock).toHaveBeenCalledWith("stored:gi_p1");
    await fake.end();
    await waitForRunEnd("c-mention");
  });

  it("attaches the visible aperçu JPEG on « améliore ça » without @, not generator history", async () => {
    await postV2(
      chatRequest({
        conversation_id: "c-improve",
        messages: [{ role: "user", parts: [{ type: "text", text: "améliore ça" }] }],
        canvas_snapshot: PREVIEW_SNAPSHOT,
      }),
    );
    expect(lastSystem()).not.toContain("<mentioned_images>");
    expect(lastUserFiles()).toEqual([{ type: "file", mediaType: "image/jpeg", data: "jpeg:stored:gi_p1" }]);
    expect(lastUserFiles().some((p) => p.data.includes("hist"))).toBe(false);
    await fake.end();
    await waitForRunEnd("c-improve");
  });

  it("leaves a plain hello without a mentioned_images block or file parts", async () => {
    await postV2(
      chatRequest({
        conversation_id: "c-plain-mention",
        messages: [{ role: "user", parts: [{ type: "text", text: "salut" }] }],
        canvas_snapshot: PREVIEW_SNAPSHOT,
      }),
    );
    expect(lastSystem()).not.toContain("<mentioned_images>");
    expect(lastUserFiles()).toEqual([]);
    expect(resolveCanvasImageToJpegMock).not.toHaveBeenCalled();
    await fake.end();
    await waitForRunEnd("c-plain-mention");
  });
});
