import { describe, it, expect } from "vitest";
import { formatSavedAt, saveStatusKind, saveStatusLabel } from "@/lib/canvas/save-status";

describe("save status", () => {
  it("maps dirty/saving/error to the top-bar labels", () => {
    expect(saveStatusLabel(saveStatusKind({ dirty: true, saving: false, saveError: null }))).toBe("Enregistrement…");
    expect(saveStatusLabel(saveStatusKind({ dirty: false, saving: true, saveError: null }))).toBe("Enregistrement…");
    expect(saveStatusLabel(saveStatusKind({ dirty: false, saving: false, saveError: null }))).toBe("Enregistré");
    expect(saveStatusLabel(saveStatusKind({ dirty: true, saving: true, saveError: "Erreur de sauvegarde" }))).toBe(
      "Erreur de sauvegarde",
    );
  });

  it("formats last save as French date + time", () => {
    expect(formatSavedAt("2026-09-18T21:31:00.000Z")).toMatch(/18\/09\/2026/);
    expect(formatSavedAt("2026-09-18T21:31:00.000Z")).toMatch(/\d{2}:\d{2}/);
    expect(formatSavedAt("2026-09-18 21:31:00")).toMatch(/18\/09\/2026/);
    expect(formatSavedAt("not-a-date")).toBeNull();
  });
});
