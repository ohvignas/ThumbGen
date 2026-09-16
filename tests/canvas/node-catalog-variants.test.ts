import { describe, it, expect } from "vitest";
import { compatibleEntries } from "@/lib/canvas/node-catalog";

type From = Parameters<typeof compatibleEntries>[0];

// "<catalog id>:<handle on the new node>", sorted, so the comparison ignores ordering details.
const offers = (from: From) =>
  compatibleEntries(from)
    .map(({ entry, newNodeHandle }) => `${entry.id}:${newNodeHandle}`)
    .sort();

describe("compatibleEntries on the generator's variant handles", () => {
  it.each([
    ["prompt-in-b", "prompt-in"],
    ["prompt-in-c", "prompt-in"],
    ["sketch-in-b", "sketch-in"],
    ["sketch-in-c", "sketch-in"],
    ["ref-in-b", "ref-in"],
    ["ref-in-c", "ref-in"],
  ])("input %s offers what %s offers", (variantHandle, baseHandle) => {
    const expected = offers({ nodeType: "generator", handleId: baseHandle, handleType: "target" });
    expect(expected.length).toBeGreaterThan(0);
    expect(offers({ nodeType: "generator", handleId: variantHandle, handleType: "target" })).toEqual(expected);
  });

  it.each(["result-b", "result-c"])("output %s offers what result offers", (variantHandle) => {
    const expected = offers({ nodeType: "generator", handleId: "result", handleType: "source" });
    expect(expected.length).toBeGreaterThan(0);
    expect(offers({ nodeType: "generator", handleId: variantHandle, handleType: "source" })).toEqual(expected);
  });

  it("offers a Prompt wired by its prompt output for prompt-in-b", () => {
    expect(offers({ nodeType: "generator", handleId: "prompt-in-b", handleType: "target" })).toContain("prompt:prompt");
  });

  it("offers a Croquis wired by its image output for sketch-in-c", () => {
    expect(offers({ nodeType: "generator", handleId: "sketch-in-c", handleType: "target" })).toContain("croquis:image");
  });

  it("offers an Aperçu from result-b", () => {
    expect(offers({ nodeType: "generator", handleId: "result-b", handleType: "source" })).toContain("apercu:preview-in");
  });
});
