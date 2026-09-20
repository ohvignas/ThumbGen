import { describe, expect, it } from "vitest";
import {
  OTHER_FORMAT_ID,
  OTHER_FORMAT_LABEL,
  VIDEO_FORMATS,
  classifyVideoFormat,
  isYouTubeShort,
  videoFormatLabel,
} from "@/lib/youtube/video-formats";

describe("video format taxonomy", () => {
  it("is a closed FR list of established formats, not title tokens", () => {
    expect(VIDEO_FORMATS).toHaveLength(12);
    expect(VIDEO_FORMATS.map((format) => format.label)).toEqual([
      "Tutoriel",
      "Documentaire",
      "Test / avis",
      "Vlog",
      "Actualités",
      "Interview",
      "Compilation",
      "Format court",
      "Comparatif",
      "Étude de cas",
      "Liste",
      "Commentaire",
    ]);
    expect(videoFormatLabel(OTHER_FORMAT_ID)).toBe(OTHER_FORMAT_LABEL);
  });
});

describe("classifyVideoFormat", () => {
  it("reads format from the title in French or English", () => {
    expect(classifyVideoFormat("Tuto Figma : créer un composant")).toBe("tutorial");
    expect(classifyVideoFormat("How to install Cursor")).toBe("tutorial");
    expect(classifyVideoFormat("Documentaire : l'histoire de YouTube")).toBe("documentary");
    expect(classifyVideoFormat("J'ai testé l'iPhone 17")).toBe("review");
    expect(classifyVideoFormat("Vlog : journée type à Paris")).toBe("vlog");
    expect(classifyVideoFormat("Les actualités tech de la semaine")).toBe("news");
    expect(classifyVideoFormat("Interview avec Sarah")).toBe("interview");
    expect(classifyVideoFormat("Compilation best of 2026")).toBe("compilation");
    expect(classifyVideoFormat("Claude vs ChatGPT : lequel choisir")).toBe("comparison");
    expect(classifyVideoFormat("Étude de cas : comment j'ai atteint 100k")).toBe("case_study");
    expect(classifyVideoFormat("Top 10 outils IA")).toBe("listicle");
    expect(classifyVideoFormat("Ma réaction au keynote")).toBe("commentary");
  });

  it("can take the format from the description when the title is clickbait", () => {
    expect(classifyVideoFormat("TU NE VAS PAS Y CROIRE", "Tutoriel complet pas à pas pour installer un LLM.")).toBe(
      "tutorial",
    );
  });

  it("treats short duration or a Shorts marker as format court", () => {
    expect(classifyVideoFormat("Tuto éclair", "", 45)).toBe("shorts");
    expect(classifyVideoFormat("Astuce #shorts", "", 180)).toBe("shorts");
    expect(classifyVideoFormat("Tuto Figma complet", "", 600)).toBe("tutorial");
    expect(isYouTubeShort("Tuto éclair", "", 45)).toBe(true);
    expect(isYouTubeShort("Astuce #shorts", "", 180)).toBe(true);
    expect(isYouTubeShort("Tu veux des résultats", "Clip #shorts", 90)).toBe(true);
    expect(isYouTubeShort("Tuto Figma complet", "", 600)).toBe(false);
  });

  it("prefers a list or a versus over a vaguer tutorial hit", () => {
    expect(classifyVideoFormat("Top 10 tutoriels Claude")).toBe("listicle");
    expect(classifyVideoFormat("Tuto : Cursor vs Claude")).toBe("comparison");
  });

  it("does not invent a topic token and falls back to Autre format", () => {
    expect(classifyVideoFormat("Cursor 2.0 smash")).toBe(OTHER_FORMAT_ID);
    expect(classifyVideoFormat("AffiliationCoupon creerQuFaut")).toBe(OTHER_FORMAT_ID);
    expect(classifyVideoFormat("")).toBe(OTHER_FORMAT_ID);
  });

  it("is deterministic", () => {
    const title = "Deep dive : l'enquête sur les algorithmes";
    expect(classifyVideoFormat(title)).toBe(classifyVideoFormat(title));
    expect(classifyVideoFormat(title)).toBe("documentary");
  });
});
