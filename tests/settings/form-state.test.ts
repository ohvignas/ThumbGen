import { describe, it, expect } from "vitest";
import { isDirty, issuesByPath, pickValues } from "@/components/settings/form-state";

describe("form state helpers", () => {
  it("pickValues copies only the requested keys", () => {
    expect(pickValues({ a: 1, b: "x", c: true }, ["a", "c"] as const)).toEqual({ a: 1, c: true });
  });

  it("isDirty compares nested values", () => {
    const initial = { theme: "dark", profile: { brandColors: ["#000000"] } };
    expect(isDirty(initial, { theme: "dark", profile: { brandColors: ["#000000"] } })).toBe(false);
    expect(isDirty(initial, { theme: "dark", profile: { brandColors: ["#000000", "#FFFFFF"] } })).toBe(true);
    expect(isDirty(initial, { theme: "light", profile: { brandColors: ["#000000"] } })).toBe(true);
  });

  it("issuesByPath keeps the first message for each path", () => {
    expect(
      issuesByPath([
        { path: "agentMaxSteps", message: "Entre 5 et 50 étapes" },
        { path: "agentMaxSteps", message: "second" },
        { path: "", message: "Objet de réglages attendu" },
      ]),
    ).toEqual({ agentMaxSteps: "Entre 5 et 50 étapes", "": "Objet de réglages attendu" });
  });
});
