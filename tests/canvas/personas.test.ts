import { describe, it, expect } from "vitest";
import {
  PERSONA_ANGLES,
  PERSONA_ANGLE_LABELS,
  personaImageUrl,
  personaNodeData,
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
});
