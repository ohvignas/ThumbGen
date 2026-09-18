import { describe, it, expect, vi, beforeEach } from "vitest";

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

const streamTextMock = vi.fn();
vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return { ...actual, streamText: (opts: unknown) => streamTextMock(opts) };
});

import { appendMessage } from "@/lib/agent/conversation/store";
import { setSetting } from "@/lib/settings";
import { postV2 } from "@/lib/agent/v2/route-handler";
import { resetRunRegistry } from "@/lib/agent/v2/run-registry";
import { chatRequest, fakeStreamResult, waitForRunEnd } from "./helpers/chat-route";

type StreamCall = {
  system: string;
  messages: Array<{ role: string; content: unknown }>;
  providerOptions: { openrouter: Record<string, unknown> };
};

const lastCall = () => streamTextMock.mock.calls.at(-1)![0] as StreamCall;
const lastSystem = () => lastCall().system;

function lastUserText(): string {
  const user = [...lastCall().messages].reverse().find((message) => message.role === "user");
  const content = user?.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((part): part is { type: "text"; text: string } => {
      return Boolean(part && typeof part === "object" && (part as { type?: string }).type === "text");
    })
    .map((part) => part.text)
    .join("");
}

async function post(text: string, conversationId: string) {
  return postV2(
    chatRequest({
      conversation_id: conversationId,
      messages: [{ role: "user", parts: [{ type: "text", text }] }],
      canvas_snapshot: { nodes: [], edges: [] },
    }),
  );
}

describe("chat route — slash invoked skill", () => {
  let fake: ReturnType<typeof fakeStreamResult>;

  beforeEach(() => {
    resetRunRegistry();
    setSetting("openrouterApiKey", "test-key");
    vi.mocked(appendMessage).mockClear();
    fake = fakeStreamResult();
    streamTextMock.mockReset();
    streamTextMock.mockImplementation(() => fake);
  });

  it("injects generate_sketch for /croquis and leaves a plain hello untouched", async () => {
    await post("/croquis moi à droite", "c-slash");
    expect(lastSystem()).toContain('<invoked_skill name="generate_sketch" slash="croquis">');
    expect(lastSystem()).toContain("graphite-on-paper");
    await fake.end();
    await waitForRunEnd("c-slash");

    fake = fakeStreamResult();
    streamTextMock.mockImplementation(() => fake);
    await post("hello", "c-plain");
    expect(lastSystem()).not.toContain('<invoked_skill name=');
    expect(lastSystem()).not.toContain("graphite-on-paper");
    await fake.end();
    await waitForRunEnd("c-plain");
  });

  it("injects create-prompt for /create-prompt and the create-propt alias", async () => {
    await post("/create-prompt moi à droite", "c-prompt");
    expect(lastSystem()).toContain('<invoked_skill name="create-prompt" slash="create-prompt">');
    expect(lastSystem()).toContain("place_node");
    expect(lastSystem()).toContain("iv-prompt");
    await fake.end();
    await waitForRunEnd("c-prompt");

    fake = fakeStreamResult();
    streamTextMock.mockImplementation(() => fake);
    await post("/create-propt", "c-propt");
    expect(lastSystem()).toContain('<invoked_skill name="create-prompt" slash="create-prompt">');
    expect(lastSystem()).toContain("The idea is EMPTY");
    expect(lastUserText()).toContain("ask_user");
    await fake.end();
    await waitForRunEnd("c-propt");
  });

  it("bare /croquis still has a non-empty model user message and skips web search", async () => {
    await post("/croquis", "c-bare");
    expect(lastSystem()).toContain('<invoked_skill name="generate_sketch" slash="croquis">');
    expect(lastSystem()).toContain("The idea is EMPTY");
    expect(lastSystem()).toContain("Do NOT call generate_sketch this turn");
    const modelText = lastUserText();
    expect(modelText.trim().length).toBeGreaterThan(0);
    expect(modelText).not.toMatch(/^\/croquis\s*$/);
    expect(modelText).toContain("ask_user");
    expect(lastCall().providerOptions.openrouter).not.toHaveProperty("web_search_options");
    expect(vi.mocked(appendMessage).mock.calls.some((call) => String(call[0]?.content_json).includes("/croquis"))).toBe(
      true,
    );
    await fake.end();
    await waitForRunEnd("c-bare");

    fake = fakeStreamResult();
    streamTextMock.mockImplementation(() => fake);
    await post("/croquis ", "c-bare-space");
    expect(lastUserText()).not.toMatch(/^\/croquis\s*$/);
    expect(lastCall().providerOptions.openrouter).not.toHaveProperty("web_search_options");
    await fake.end();
    await waitForRunEnd("c-bare-space");
  });

  it("does not inject on a client-tool continuation", async () => {
    await postV2(
      chatRequest({
        conversation_id: "c-cont",
        messages: [
          {
            role: "assistant",
            parts: [
              {
                type: "tool-ask_user",
                toolCallId: "q1",
                state: "output-available",
                input: { question: "Sujet ?", options: [{ id: "a", label: "A" }] },
                output: { selected: ["a"] },
              },
            ],
          },
        ],
      }),
    );
    expect(lastSystem()).not.toContain('<invoked_skill name=');
    expect(lastSystem()).not.toContain("graphite-on-paper");
    await fake.end();
    await waitForRunEnd("c-cont");
  });
});
