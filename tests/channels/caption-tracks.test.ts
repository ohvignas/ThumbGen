import { describe, expect, it } from "vitest";
import {
  captionLanguagePreference,
  json3Url,
  parseJson3Events,
  pickCaptionTrack,
  type CaptionTrack,
} from "@/lib/youtube/caption-tracks";

const track = (partial: Partial<CaptionTrack> & Pick<CaptionTrack, "baseUrl" | "languageCode">): CaptionTrack => ({
  kind: partial.kind,
  name: partial.name,
  baseUrl: partial.baseUrl,
  languageCode: partial.languageCode,
});

describe("captionLanguagePreference", () => {
  it("puts the UI language first, then fr and en without duplicates", () => {
    expect(captionLanguagePreference("fr")).toEqual(["fr", "en"]);
    expect(captionLanguagePreference("en")).toEqual(["en", "fr"]);
    expect(captionLanguagePreference("es")).toEqual(["es", "fr", "en"]);
  });
});

describe("pickCaptionTrack", () => {
  const officialFr = track({ baseUrl: "https://www.youtube.com/api/timedtext?v=a&lang=fr", languageCode: "fr-FR" });
  const asrFr = track({ baseUrl: "https://www.youtube.com/api/timedtext?v=a&lang=fr&kind=asr", languageCode: "fr", kind: "asr" });
  const officialEn = track({ baseUrl: "https://www.youtube.com/api/timedtext?v=a&lang=en", languageCode: "en" });
  const asrEn = track({ baseUrl: "https://www.youtube.com/api/timedtext?v=a&lang=en&kind=asr", languageCode: "en-US", kind: "asr" });

  it("prefers official fr over official en over ASR fr over ASR en", () => {
    expect(pickCaptionTrack([asrEn, asrFr, officialEn, officialFr], ["fr", "en"])).toEqual(officialFr);
    expect(pickCaptionTrack([asrEn, asrFr, officialEn], ["fr", "en"])).toEqual(officialEn);
    expect(pickCaptionTrack([asrEn, asrFr], ["fr", "en"])).toEqual(asrFr);
    expect(pickCaptionTrack([asrEn], ["fr", "en"])).toEqual(asrEn);
  });

  it("returns null when there are no tracks", () => {
    expect(pickCaptionTrack([], ["fr", "en"])).toBeNull();
  });
});

describe("json3Url", () => {
  it("strips an existing fmt and appends fmt=json3", () => {
    expect(json3Url("https://www.youtube.com/api/timedtext?v=a&fmt=srv3&lang=fr")).toBe(
      "https://www.youtube.com/api/timedtext?v=a&lang=fr&fmt=json3",
    );
    expect(json3Url("https://www.youtube.com/api/timedtext?v=a&lang=en")).toBe(
      "https://www.youtube.com/api/timedtext?v=a&lang=en&fmt=json3",
    );
  });
});

describe("parseJson3Events", () => {
  it("joins segs and skips style-only events", () => {
    const cues = parseJson3Events({
      events: [
        { tStartMs: 0, dDurationMs: 0 },
        { tStartMs: 120, dDurationMs: 800, segs: [{ utf8: "Bonjour " }, { utf8: "le\nmonde" }] },
        { tStartMs: 1000, dDurationMs: 400, segs: [{ utf8: "\n" }] },
        { tStartMs: 2000, dDurationMs: 500, segs: [{ utf8: "Suite." }] },
      ],
    });
    expect(cues).toEqual([
      { startMs: 120, durationMs: 800, text: "Bonjour le monde" },
      { startMs: 2000, durationMs: 500, text: "Suite." },
    ]);
  });
});
