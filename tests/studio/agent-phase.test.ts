import { describe, it, expect } from "vitest";
import {
  STUDIO_PHASE_COPY,
  advanceStudioPhase,
  phaseFromToolName,
  toolNameFromPart,
} from "@/lib/studio/agent-phase";

describe("studio agent phase", () => {
  it("uses the locked French copy and never a step index", () => {
    expect(STUDIO_PHASE_COPY.listening).toBe("L’agent t’écoute");
    expect(STUDIO_PHASE_COPY.researching).toBe("L’agent lit tes dernières vidéos…");
    expect(STUDIO_PHASE_COPY.asking_format).toBe("L’agent précise le format de tournage");
    expect(STUDIO_PHASE_COPY.writing).toBe("L’agent écrit titres, description et script…");
    expect(STUDIO_PHASE_COPY.filling).toBe("L’agent prépare les données");
    expect(STUDIO_PHASE_COPY.done).toBe("Brouillon prêt");
    for (const label of Object.values(STUDIO_PHASE_COPY)) {
      expect(label).not.toMatch(/Étape\s+\d/);
      expect(label).not.toMatch(/\/7/);
    }
  });

  it("advances listening → researching → asking_format → writing → filling → done", () => {
    expect(phaseFromToolName("retrieve_own_corpus")).toBe("researching");
    expect(phaseFromToolName("list_studio_videos")).toBe("researching");
    expect(phaseFromToolName("upsert_studio_script")).toBe("filling");
    expect(phaseFromToolName("finish_turn")).toBe("done");
    expect(advanceStudioPhase("listening", "retrieve_own_corpus")).toBe("researching");
    expect(advanceStudioPhase("researching", "ask_user")).toBe("asking_format");
    expect(advanceStudioPhase("asking_format", "read_skill")).toBe("writing");
    expect(advanceStudioPhase("writing", "upsert_studio_script")).toBe("filling");
    expect(advanceStudioPhase("filling", "finish_turn")).toBe("done");
    expect(advanceStudioPhase("filling", "retrieve_own_corpus")).toBe("filling");
  });

  it("reads a tool name from an AI SDK part", () => {
    expect(toolNameFromPart({ toolName: "retrieve_own_corpus" })).toBe("retrieve_own_corpus");
    expect(toolNameFromPart({ type: "tool-retrieve_own_corpus" })).toBe("retrieve_own_corpus");
    expect(toolNameFromPart({ type: "text" })).toBeNull();
  });
});
