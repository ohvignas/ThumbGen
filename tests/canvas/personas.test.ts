import { describe, it, expect } from "vitest";
import {
  PERSONA_ANGLES,
  PERSONA_ANGLE_LABELS,
  personaImageUrl,
  personaNodeData,
  personaPickerItem,
} from "@/lib/personas";

describe("personas helpers", () => {
  it("lists the three angles with French labels", () => {
    expect(PERSONA_ANGLES).toEqual(["front", "left", "right"]);
    expect(PERSONA_ANGLE_LABELS).toEqual({ front: "Face", left: "Profil gauche", right: "Profil droit" });
  });

  it("builds the angle image URL", () => {
    expect(personaImageUrl("p1", "left")).toBe("/api/personas/image?id=p1&angle=left");
  });

  it("builds faceReference node data with only the captured angles", () => {
    expect(personaNodeData({ id: "p1", label: "Antoine", angles: ["front", "right"] })).toEqual({
      label: "Antoine",
      personaId: "p1",
      personaAngles: {
        front: "/api/personas/image?id=p1&angle=front",
        right: "/api/personas/image?id=p1&angle=right",
      },
    });
  });

  it("builds a chat library item from the first angle, or nothing without photos", () => {
    expect(personaPickerItem({ id: "p1", label: "Antoine", angles: ["left", "right"] })).toEqual({
      source: "stored:persona_p1",
      preview_url: "/api/personas/image?id=p1&angle=left",
      label: "Antoine",
    });
    expect(personaPickerItem({ id: "p2", label: "", angles: ["front"] })?.label).toBe("Personnage");
    expect(personaPickerItem({ id: "p3", label: "Vide", angles: [] })).toBeNull();
  });
});
