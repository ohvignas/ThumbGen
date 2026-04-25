import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getDb } from "@/lib/db";

const transcriptionsCreateMock = vi.fn();

vi.mock("openai", () => {
  return {
    default: class {
      audio = {
        transcriptions: {
          create: transcriptionsCreateMock,
        },
      };
    },
  };
});

beforeEach(() => {
  getDb()
    .prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)")
    .run("openaiApiKey", "test-openai-key");
  transcriptionsCreateMock.mockReset();
});

afterEach(() => {
  // leave mocks clean
});

describe("transcribeAudio", () => {
  it("calls OpenAI gpt-4o-mini-transcribe and returns text", async () => {
    transcriptionsCreateMock.mockResolvedValueOnce({ text: "bonjour le monde" });
    const { transcribeAudio } = await import("@/lib/agent/transcribe");
    const file = new File([new Uint8Array([1, 2, 3])], "audio.webm", { type: "audio/webm" });
    const r = await transcribeAudio(file);
    expect(r.text).toBe("bonjour le monde");
    expect(transcriptionsCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ model: "gpt-4o-mini-transcribe", language: "fr" }),
    );
  });

  it("throws when OPENAI key is missing", async () => {
    getDb().prepare("DELETE FROM settings WHERE key = ?").run("openaiApiKey");
    delete process.env.OPENAI_API_KEY;
    const { transcribeAudio } = await import("@/lib/agent/transcribe");
    const file = new File([new Uint8Array([1, 2, 3])], "a.webm", { type: "audio/webm" });
    await expect(transcribeAudio(file)).rejects.toThrow(/OPENAI_API_KEY/);
  });
});

describe("POST /api/agent/transcribe", () => {
  it("returns 400 when no audio field", async () => {
    const { POST } = await import("@/app/api/agent/transcribe/route");
    const fd = new FormData();
    const req = new Request("http://localhost/api/agent/transcribe", { method: "POST", body: fd });
    const res = await POST(req as never);
    expect(res.status).toBe(400);
  });

  it("returns 400 on empty audio", async () => {
    const { POST } = await import("@/app/api/agent/transcribe/route");
    const fd = new FormData();
    fd.append("audio", new File([], "empty.webm", { type: "audio/webm" }));
    const req = new Request("http://localhost/api/agent/transcribe", { method: "POST", body: fd });
    const res = await POST(req as never);
    expect(res.status).toBe(400);
  });

  it("transcribes and returns text on happy path", async () => {
    transcriptionsCreateMock.mockResolvedValueOnce({ text: "hello" });
    const { POST } = await import("@/app/api/agent/transcribe/route");
    const fd = new FormData();
    fd.append("audio", new File([new Uint8Array([1, 2, 3])], "a.webm", { type: "audio/webm" }));
    const req = new Request("http://localhost/api/agent/transcribe", { method: "POST", body: fd });
    const res = await POST(req as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.text).toBe("hello");
  });
});
