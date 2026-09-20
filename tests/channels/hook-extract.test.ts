import { describe, expect, it } from "vitest";
import { HOOK_WINDOW_MS, extractHook } from "@/lib/youtube/hook-extract";

describe("extractHook", () => {
  it("keeps only cues that start before 30s and splits into at most 3 quotes", () => {
    const hook = extractHook([
      { startMs: 0, durationMs: 2000, text: "Tu fais ça complètement à l'envers. Voici la preuve." },
      { startMs: 8000, durationMs: 2000, text: "Dans trente secondes tu vas voir le chiffre." },
      { startMs: 20000, durationMs: 2000, text: "Troisième phrase utile." },
      { startMs: HOOK_WINDOW_MS, durationMs: 2000, text: "Trop tard, hors fenêtre." },
      { startMs: 40000, durationMs: 2000, text: "Encore plus tard." },
    ]);
    expect(hook.quotes).toEqual([
      "Tu fais ça complètement à l'envers",
      "Voici la preuve",
      "Dans trente secondes tu vas voir le chiffre",
    ]);
    expect(hook.hookText).toContain("envers");
    expect(hook.cueCount).toBe(3);
    expect(hook.quotes.join(" ")).not.toContain("Trop tard");
  });

  it("returns empty quotes when nothing is spoken in the window", () => {
    expect(extractHook([{ startMs: 45_000, durationMs: 1000, text: "Plus tard." }])).toEqual({
      quotes: [],
      hookText: "",
      cueCount: 0,
    });
  });

  it("truncates a long quote at 140 characters on a word boundary when possible", () => {
    const long = `${"mot ".repeat(50)}fin.`;
    const hook = extractHook([{ startMs: 0, durationMs: 1000, text: long }]);
    expect(hook.quotes).toHaveLength(1);
    expect(hook.quotes[0]!.length).toBeLessThanOrEqual(140);
    expect(hook.quotes[0]!.endsWith("…") || hook.quotes[0]!.length <= 140).toBe(true);
  });
});
