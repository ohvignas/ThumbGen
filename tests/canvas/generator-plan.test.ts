import { describe, it, expect } from "vitest";
import { generationSummary, imageCount, planGeneration } from "@/lib/canvas/generator-variants";

describe("planGeneration", () => {
  const inputs = { A: "inputs-A", B: "inputs-B", C: "inputs-C" };

  it("normal mode: one task for the main model", () => {
    expect(planGeneration({ model: "m1", numImages: 3 }, inputs)).toEqual([
      { variant: "A", model: "m1", count: 3, inputs: "inputs-A" },
    ]);
  });

  it("normal mode: one task per compared model, main model first, duplicates dropped", () => {
    expect(planGeneration({ model: "m1", numImages: 2, compareModels: ["m2", "m1", "m3"] }, inputs)).toEqual([
      { variant: "A", model: "m1", count: 2, inputs: "inputs-A" },
      { variant: "A", model: "m2", count: 2, inputs: "inputs-A" },
      { variant: "A", model: "m3", count: 2, inputs: "inputs-A" },
    ]);
  });

  it("A/B mode: one task per variant with the main model, compared models ignored", () => {
    expect(
      planGeneration({ model: "m1", numImages: 2, abTest: { variants: ["A", "B"] }, compareModels: ["m2"] }, inputs),
    ).toEqual([
      { variant: "A", model: "m1", count: 2, inputs: "inputs-A" },
      { variant: "B", model: "m1", count: 2, inputs: "inputs-B" },
    ]);
  });

  it("A/B/C mode: three tasks, count per variant", () => {
    const tasks = planGeneration({ model: "m1", numImages: 1, abTest: { variants: ["A", "B", "C"] } }, inputs);
    expect(tasks.map((task) => [task.variant, task.count, task.inputs])).toEqual([
      ["A", 1, "inputs-A"],
      ["B", 1, "inputs-B"],
      ["C", 1, "inputs-C"],
    ]);
  });

  it("an abTest with a single variant is normal mode", () => {
    expect(planGeneration({ model: "m1", abTest: { variants: ["A"] }, compareModels: ["m2"] }, inputs)).toHaveLength(2);
  });

  it("counts at least one image per task", () => {
    expect(imageCount(undefined)).toBe(1);
    expect(imageCount(0)).toBe(1);
    expect(imageCount(Number.NaN)).toBe(1);
    expect(imageCount(2.7)).toBe(2);
    expect(imageCount(5)).toBe(5);
  });

  it("throws when an active variant has no inputs", () => {
    expect(() => planGeneration({ model: "m1", abTest: { variants: ["A", "B"] } }, { A: "inputs-A" })).toThrow(
      /variant B/,
    );
  });
});

describe("generationSummary", () => {
  it.each([
    ["1 image", [1], false],
    ["3 images", [3], false],
    ["2 modèles × 2 images", [2, 2], false],
    ["3 modèles × 1 image", [1, 1, 1], false],
    ["2 variantes × 2 images · 4 images", [2, 2], true],
    ["3 variantes × 1 image · 3 images", [1, 1, 1], true],
  ] as const)("« %s »", (expected, counts, abTestActive) => {
    expect(generationSummary(counts.map((count) => ({ count })), abTestActive)).toBe(expected);
  });
});
