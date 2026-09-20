import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/lib/db";
import { setSetting } from "@/lib/settings";

const fetchMock = vi.fn<typeof fetch>();
let savedEnv: string | undefined;

beforeEach(() => {
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

describe("jevClickNouls", () => {
  it("returns an empty map without a key and does not call TypeSafe", async () => {
    const { jevClickNouls } = await import("@/lib/typesafe/rerank-titles");
    expect(await jevClickNouls("notion", [{ videoId: "aaaaaaaaaaa", title: "Hello" }])).toEqual(new Map());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps noul answers back to video ids", async () => {
    setSetting("typesafeApiKey", "tsk-test");
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ answers: { click_0: { type: "noul", noul: 0.82 } } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const { jevClickNouls } = await import("@/lib/typesafe/rerank-titles");
    const nouls = await jevClickNouls("notion", [{ videoId: "aaaaaaaaaaa", title: "Hello" }]);
    expect(nouls.get("aaaaaaaaaaa")).toBe(0.82);
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://api.typesafe.ai/v1/systemone");
  });

  it("asks Jev about followed titles without sending images", async () => {
    setSetting("typesafeApiKey", "tsk-test");
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ answers: { click_0: { type: "noul", noul: 0.4 } } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const { jevClickNouls } = await import("@/lib/typesafe/rerank-titles");
    await jevClickNouls("Ma chaîne", [{ videoId: "aaaaaaaaaaa", title: "Hello" }], "followed");
    const body = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.body));
    expect(body.state).toEqual({ query: "Ma chaîne", titles: { click_0: "Hello" } });
    expect(body.model).toBe("jev-latest");
    expect(JSON.stringify(body)).not.toMatch(/https?:|thumbnail|mqdefault|\.jpg|image\//i);
    expect(body.questions.click_0.instructions).toContain("followed YouTube");
    expect(body.questions.click_0.instructions).toContain("title packaging");
    expect(body.questions.click_0.instructions).not.toContain("searched YouTube");
  });

  it("returns an empty map when TypeSafe fails", async () => {
    setSetting("typesafeApiKey", "tsk-test");
    fetchMock.mockRejectedValue(new Error("down"));
    const { jevClickNouls } = await import("@/lib/typesafe/rerank-titles");
    expect(await jevClickNouls("notion", [{ videoId: "aaaaaaaaaaa", title: "Hello" }])).toEqual(new Map());
  });
});

describe("jevTrendJudgments", () => {
  const input = {
    videoId: "aaaaaaaaaaa",
    title: "Tuto Cursor",
    description: "Pas à pas",
    durationSeconds: 600,
    overperformance: 4.2,
    viewsPerHour: 180,
    velocityKind: "delta" as const,
  };

  it("returns an empty map without a key and does not call TypeSafe", async () => {
    const { jevTrendJudgments } = await import("@/lib/typesafe/rerank-titles");
    expect(await jevTrendJudgments([input])).toEqual(new Map());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("asks Choice for format and Score for a note, passing ×N as context not as a calculation", async () => {
    setSetting("typesafeApiKey", "tsk-test");
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          answers: {
            fmt_0: { type: "choice", choice: "tutorial", confidence: 0.9 },
            note_0: { type: "score", score: 3.2, confidence: 0.8 },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const { jevTrendJudgments } = await import("@/lib/typesafe/rerank-titles");
    const judged = await jevTrendJudgments([input]);
    expect(judged.get("aaaaaaaaaaa")).toEqual({ formatId: "tutorial", note: 8, score01: 0.8 });
    const body = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.body));
    expect(body.questions.fmt_0.type).toBe("choice");
    expect(body.questions.fmt_0.criteria.tutorial).toBeTruthy();
    expect(body.questions.fmt_0.criteria.other).toBeTruthy();
    expect(body.questions.note_0.type).toBe("score");
    expect(body.questions.note_0.criteria).toHaveLength(5);
    expect(body.state.videos.v0.overperformance).toBe(4.2);
    expect(body.questions.note_0.instructions).toMatch(/already computed|déjà calcul/i);
    expect(JSON.stringify(body.questions)).not.toMatch(/views ÷|calculate overperf|compute velocity/i);
    expect(JSON.stringify(body.state)).not.toMatch(/https?:|mqdefault|\.jpg|image\//i);
  });

  it("maps a 0–4 Score onto /10 (0.68 is a weak package, not a 0–1 default)", async () => {
    setSetting("typesafeApiKey", "tsk-test");
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          answers: {
            fmt_0: { type: "choice", choice: "shorts", confidence: 0.9 },
            note_0: { type: "score", score: 0.68, confidence: 0.7 },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const { jevTrendJudgments } = await import("@/lib/typesafe/rerank-titles");
    const judged = await jevTrendJudgments([input]);
    expect(judged.get("aaaaaaaaaaa")).toEqual({ formatId: "shorts", note: 1.7, score01: 0.17 });
  });

  it("returns an empty map when TypeSafe fails", async () => {
    setSetting("typesafeApiKey", "tsk-test");
    fetchMock.mockRejectedValue(new Error("down"));
    const { jevTrendJudgments } = await import("@/lib/typesafe/rerank-titles");
    expect(await jevTrendJudgments([{ ...input, title: "Hello" }])).toEqual(new Map());
  });
});
