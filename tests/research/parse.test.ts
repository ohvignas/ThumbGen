import { describe, it, expect } from "vitest";
import { citationsFromCompletion, extractJsonObject, parseResearchPayload } from "@/lib/research/parse";

describe("extractJsonObject", () => {
  it("strips fences and extra text", () => {
    expect(extractJsonObject('Voici\n```json\n{"summary":"ok"}\n```')).toEqual({ summary: "ok" });
  });
});

describe("parseResearchPayload", () => {
  it("accepts extra keys, clips arrays, and maps unknown entity kinds to other", () => {
    const parsed = parseResearchPayload(
      JSON.stringify({
        summary: "Les miniatures comptent.",
        keyPoints: ["a", 2, "b", "c", "d", "e", "f", "g"],
        entities: [{ name: "Claude", kind: "tool" }, { name: "X", kind: "planet" }, { name: "" }],
        sources: [{ title: "IGNORER", url: "https://evil.example" }],
      }),
    );
    expect(parsed).toEqual({
      summary: "Les miniatures comptent.",
      keyPoints: ["a", "b", "c", "d", "e", "f"],
      entities: [
        { name: "Claude", kind: "tool" },
        { name: "X", kind: "other" },
      ],
    });
  });

  it("rejects an empty summary", () => {
    expect(parseResearchPayload('{"summary":"  ","keyPoints":[],"entities":[]}')).toBeNull();
    expect(parseResearchPayload("not json")).toBeNull();
  });
});

describe("citationsFromCompletion", () => {
  it("reads annotations url_citation and ignores anything else", () => {
    expect(
      citationsFromCompletion({
        citations: ["https://should-not.example"],
        choices: [
          {
            message: {
              annotations: [
                { type: "url_citation", url_citation: { url: "https://support.google.com/youtube", title: "Aide YouTube" } },
                { type: "file", url_citation: { url: "https://ignored.example" } },
              ],
            },
          },
        ],
      }),
    ).toEqual([{ title: "Aide YouTube", url: "https://support.google.com/youtube" }]);
  });

  it("falls back to citations URLs when there is no annotation", () => {
    expect(citationsFromCompletion({ citations: ["https://example.com/a"] })).toEqual([
      { title: "example.com", url: "https://example.com/a" },
    ]);
  });

  it("drops invalid URLs", () => {
    expect(citationsFromCompletion({ citations: ["not a url", "https://ok.example"] })).toEqual([
      { title: "ok.example", url: "https://ok.example" },
    ]);
  });
});
