import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { getDb } from "@/lib/db";
import { createConversation, getConversation } from "@/lib/agent/conversation/store";
import { setSetting } from "@/lib/settings";

const generateTextMock = vi.fn();
vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return { ...actual, generateText: (opts: unknown) => generateTextMock(opts) };
});

const projectId = "test-auto-title";
let savedOpenRouter: string | undefined;

beforeAll(() => {
  getDb()
    .prepare("INSERT OR IGNORE INTO projects_meta (id, name) VALUES (?, ?)")
    .run(projectId, "Auto-Title Test Project");
});

beforeEach(() => {
  savedOpenRouter = process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
});

afterEach(() => {
  if (savedOpenRouter === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = savedOpenRouter;
});

describe("generateAndPersistTitle", () => {
  it("persists a cleaned-up title from a real model response", async () => {
    setSetting("openrouterApiKey", "test-key");
    generateTextMock.mockResolvedValue({ text: '"Miniature gaming néon"  ' });
    const { generateAndPersistTitle } = await import("@/lib/agent/conversation/auto-title");
    const conv = createConversation(projectId);

    await generateAndPersistTitle(conv.id, "Fais-moi une miniature gaming avec un thème néon");

    expect(generateTextMock).toHaveBeenCalledTimes(1);
    const callArgs = generateTextMock.mock.calls[0][0] as { maxOutputTokens: number; messages: Array<{ role: string; content: string }> };
    expect(callArgs.maxOutputTokens).toBe(40);
    expect(callArgs.messages[0].content).toContain("miniature gaming");
    expect(getConversation(conv.id)?.title).toBe("Miniature gaming néon");
  });

  it("does nothing when no OpenRouter key is configured", async () => {
    setSetting("openrouterApiKey", "");
    generateTextMock.mockClear();
    const { generateAndPersistTitle } = await import("@/lib/agent/conversation/auto-title");
    const conv = createConversation(projectId, "Nouvelle conversation");

    await generateAndPersistTitle(conv.id, "un message quelconque");

    expect(generateTextMock).not.toHaveBeenCalled();
    expect(getConversation(conv.id)?.title).toBe("Nouvelle conversation");
  });

  it("does nothing for an empty first message", async () => {
    setSetting("openrouterApiKey", "test-key");
    generateTextMock.mockClear();
    const { generateAndPersistTitle } = await import("@/lib/agent/conversation/auto-title");
    const conv = createConversation(projectId, "Nouvelle conversation");

    await generateAndPersistTitle(conv.id, "   ");

    expect(generateTextMock).not.toHaveBeenCalled();
    expect(getConversation(conv.id)?.title).toBe("Nouvelle conversation");
  });

  it("leaves the title unchanged when the model call throws", async () => {
    setSetting("openrouterApiKey", "test-key");
    generateTextMock.mockClear();
    generateTextMock.mockRejectedValue(new Error("upstream 500"));
    const { generateAndPersistTitle } = await import("@/lib/agent/conversation/auto-title");
    const conv = createConversation(projectId, "Nouvelle conversation");

    await expect(generateAndPersistTitle(conv.id, "un message")).resolves.toBeUndefined();
    expect(getConversation(conv.id)?.title).toBe("Nouvelle conversation");
  });
});
