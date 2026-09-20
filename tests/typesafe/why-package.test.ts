import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/lib/db";
import { setSetting } from "@/lib/settings";

const fetchMock = vi.fn<typeof fetch>();
let savedEnv: string | undefined;

const state = {
  title: "Tu fais ça à l'envers",
  descriptionExcerpt: "Preuve en 10 minutes.",
  hookText: "Voici le chiffre que personne ne montre",
  hookQuotes: ["Voici le chiffre que personne ne montre"],
  captionKind: "official" as const,
  language: "fr",
  overperformance: 4.2,
  performanceKind: "scored" as const,
  viewsPerHour: 180,
  velocityKind: "delta" as const,
};

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

describe("jevWhyPackage", () => {
  it("returns unused empty judgments without a key", async () => {
    const { jevWhyPackage } = await import("@/lib/typesafe/why-package");
    expect(await jevWhyPackage(state)).toEqual({
      used: false,
      note: null,
      holdNoul: null,
      holdBand: null,
      categoryId: null,
      confidence: null,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("asks Score, Noul and Choice in one call and does not send pixels or ask for CTR", async () => {
    setSetting("typesafeApiKey", "tsk-test");
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          answers: {
            click: { type: "score", score: 3.2, confidence: 0.8 },
            hold: { type: "noul", noul: 0.71 },
            category: { type: "choice", choice: "curiosity_gap", confidence: 0.77 },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const { jevWhyPackage } = await import("@/lib/typesafe/why-package");
    const judged = await jevWhyPackage(state);
    expect(judged).toEqual({
      used: true,
      note: 8,
      holdNoul: 0.71,
      holdBand: "holds",
      categoryId: "curiosity_gap",
      confidence: 0.8,
    });
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body.model).toBe("jev-latest");
    expect(body.questions.click.type).toBe("score");
    expect(body.questions.hold.type).toBe("noul");
    expect(body.questions.category.type).toBe("choice");
    expect(body.state.package.overperformance).toBe(4.2);
    expect(JSON.stringify(body)).not.toMatch(/https?:|thumbnail|mqdefault|\.jpg|image\//i);
    expect(JSON.stringify(body.questions)).not.toMatch(/\bCTR\b|click-through|recalculate|invent/i);
    expect(body.questions.click.instructions).toMatch(/already computed/i);
    expect(body.questions.hold.instructions).toMatch(/already computed/i);
  });

  it("returns unused when TypeSafe fails", async () => {
    setSetting("typesafeApiKey", "tsk-test");
    fetchMock.mockRejectedValue(new Error("down"));
    const { jevWhyPackage } = await import("@/lib/typesafe/why-package");
    expect((await jevWhyPackage(state)).used).toBe(false);
  });
});
