import { describe, it, expect } from "vitest";
import {
  ETIQUETTES,
  isEtiquette,
  isWritingProjectId,
  newStudioVideoId,
  videoIdFromWritingProject,
  writingProjectId,
} from "@/lib/studio/types";

describe("studio types", () => {
  it("lists the five observed Étiquettes and rejects invented statuses", () => {
    expect([...ETIQUETTES]).toEqual(["Propositions", "Pas commencer", "En cours", "En prod", "Terminer"]);
    expect(isEtiquette("En cours")).toBe(true);
    expect(isEtiquette("Status")).toBe(false);
    expect(isEtiquette("Done")).toBe(false);
  });

  it("mints a local video id and a writing project id that is not a canvas project", () => {
    const videoId = newStudioVideoId();
    expect(videoId.startsWith("vid_")).toBe(true);
    expect(videoId.length).toBeGreaterThan(8);
    expect(writingProjectId(videoId)).toBe(`studio:${videoId}`);
    expect(isWritingProjectId(`studio:${videoId}`)).toBe(true);
    expect(isWritingProjectId("default")).toBe(false);
    expect(isWritingProjectId("proj_123")).toBe(false);
    expect(videoIdFromWritingProject(`studio:${videoId}`)).toBe(videoId);
    expect(videoIdFromWritingProject("default")).toBeNull();
  });
});
