import { describe, it, expect, beforeEach } from "vitest";
import { getDb } from "@/lib/db";
import { listStudioVideos, getStudioVideo } from "@/lib/studio/store";
import { importStudioCsv, importStudioMarkdown, parseStudioCsv } from "@/lib/studio/import";

beforeEach(() => {
  getDb().exec("DELETE FROM studio_drafts");
  getDb().exec("DELETE FROM studio_videos");
});

describe("studio import", () => {
  it("parses a Notion-style CSV export without calling a network", () => {
    const rows = parseStudioCsv("Nom,URL,Étiquettes\nVibe Coding,,En cours\nLM Studio,https://youtu.be/67TPSTL0NsA,Terminer\n");
    expect(rows).toEqual([
      { title: "Vibe Coding", youtubeUrl: null, etiquette: "En cours" },
      { title: "LM Studio", youtubeUrl: "https://youtu.be/67TPSTL0NsA", etiquette: "Terminer" },
    ]);
  });

  it("imports CSV rows into the local store", () => {
    const result = importStudioCsv("Nom,URL,Étiquettes\nGrok Bot,,En prod\n");
    expect(result).toEqual({ imported: 1, errors: [] });
    expect(listStudioVideos()[0]?.title).toBe("Grok Bot");
    expect(listStudioVideos()[0]?.etiquette).toBe("En prod");
  });

  it("imports a pasted house-template markdown as a draft", () => {
    const { videoId } = importStudioMarkdown({
      title: "Vibe Coding : c’est quoi ?",
      etiquette: "En cours",
      markdown: "SCRIPT\n<details>\n<summary>Script Vidéo longue</summary>\n```javascript\n## 1. Introduction\nCoucou\n```\n</details>\n## A/B Titre\n",
    });
    expect(getStudioVideo(videoId)?.draft.script).toContain("Coucou");
  });
});
