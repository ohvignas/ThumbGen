import { describe, it, expect } from "vitest";
import {
  activeVariants,
  baseGeneratorHandle,
  edgesToRemoveForVariants,
  inputHandle,
  isAbTestActive,
  isPromptInputHandle,
  normalizeVariants,
  parseGeneratorHandle,
  resolveVariantInputs,
  resultHandle,
  summarizeAbTest,
  variantRemovalCopy,
} from "@/lib/canvas/generator-variants";

type TestNode = { id: string; type: string; data: Record<string, unknown> };

const node = (id: string, type: string, data: Record<string, unknown> = {}): TestNode => ({ id, type, data });
const edge = (source: string, targetHandle: string | null, target = "gen") => ({ source, target, targetHandle });
const ids = (items: { id: string }[]) => items.map((item) => item.id);

describe("generator handles", () => {
  it("keeps today's ids for A, suffixes B and C, never suffixes common inputs", () => {
    expect(inputHandle("prompt")).toBe("prompt-in");
    expect(inputHandle("prompt", "B")).toBe("prompt-in-b");
    expect(inputHandle("sketch", "C")).toBe("sketch-in-c");
    expect(inputHandle("ref", "B")).toBe("ref-in-b");
    expect(inputHandle("face", "C")).toBe("face-in");
    expect(inputHandle("logo", "B")).toBe("logo-in");
    expect(resultHandle("A")).toBe("result");
    expect(resultHandle("B")).toBe("result-b");
    expect(resultHandle("C")).toBe("result-c");
  });

  it("parses generator handles and nothing else", () => {
    expect(parseGeneratorHandle("ref-in-c")).toEqual({ kind: "input", slot: "ref", variant: "C" });
    expect(parseGeneratorHandle("face-in")).toEqual({ kind: "input", slot: "face", variant: "A" });
    expect(parseGeneratorHandle("result-b")).toEqual({ kind: "output", variant: "B" });
    expect(parseGeneratorHandle("face-in-b")).toBeNull();
    expect(parseGeneratorHandle("preview-in")).toBeNull();
    expect(parseGeneratorHandle("")).toBeNull();
    expect(parseGeneratorHandle(null)).toBeNull();
    expect(parseGeneratorHandle(undefined)).toBeNull();
  });

  it("maps variant handles to their A counterpart", () => {
    expect(baseGeneratorHandle("prompt-in-b")).toBe("prompt-in");
    expect(baseGeneratorHandle("sketch-in-c")).toBe("sketch-in");
    expect(baseGeneratorHandle("ref-in-b")).toBe("ref-in");
    expect(baseGeneratorHandle("result-c")).toBe("result");
    expect(baseGeneratorHandle("logo-in")).toBe("logo-in");
    expect(baseGeneratorHandle("image")).toBe("image");
  });

  it("recognises the prompt input of every variant", () => {
    expect(isPromptInputHandle("prompt-in")).toBe(true);
    expect(isPromptInputHandle("prompt-in-c")).toBe(true);
    expect(isPromptInputHandle("ref-in-b")).toBe(false);
    expect(isPromptInputHandle(null)).toBe(false);
  });
});

describe("active variants", () => {
  it("orders variants, always keeps A and needs B before C", () => {
    expect(normalizeVariants(["C", "B", "A"])).toEqual(["A", "B", "C"]);
    expect(normalizeVariants(["B"])).toEqual(["A", "B"]);
    expect(normalizeVariants(["A", "C"])).toEqual(["A"]);
    expect(normalizeVariants(["Z"])).toEqual(["A"]);
  });

  it("treats a missing, malformed or single-variant abTest as normal mode", () => {
    expect(activeVariants(undefined)).toEqual(["A"]);
    expect(activeVariants({ variants: ["A"] })).toEqual(["A"]);
    expect(activeVariants({ variants: "AB" })).toEqual(["A"]);
    expect(activeVariants({ variants: ["A", "B"] })).toEqual(["A", "B"]);
    expect(activeVariants({ variants: ["A", "B", "C"] })).toEqual(["A", "B", "C"]);
    expect(isAbTestActive({ variants: ["A"] })).toBe(false);
    expect(isAbTestActive({ variants: ["A", "B"] })).toBe(true);
  });

  it("summarizes only an active test", () => {
    expect(summarizeAbTest({ variants: ["A", "B", "C"] })).toEqual({ variants: ["A", "B", "C"] });
    expect(summarizeAbTest({ variants: ["A"] })).toBeUndefined();
    expect(summarizeAbTest(undefined)).toBeUndefined();
  });
});

describe("resolveVariantInputs", () => {
  const nodes = [
    node("face", "faceReference"),
    node("logo", "swipeFile", { kind: "logo" }),
    node("pA", "prompt"),
    node("pB", "prompt"),
    node("skA", "sketch"),
    node("refA", "swipeFile"),
    node("refC", "swipeFile"),
    node("other", "prompt"),
  ];
  const edges = [
    edge("face", "face-in"),
    edge("logo", "logo-in"),
    edge("pA", "prompt-in"),
    edge("pB", "prompt-in-b"),
    edge("skA", "sketch-in"),
    edge("refA", "ref-in"),
    edge("refC", "ref-in-c"),
    edge("other", "prompt-in", "another-generator"),
  ];

  it("shares the Personnage and the Logo with every variant", () => {
    for (const variant of ["A", "B", "C"] as const) {
      const inputs = resolveVariantInputs(edges, nodes, "gen", variant);
      expect(ids(inputs.face)).toEqual(["face"]);
      expect(ids(inputs.logo)).toEqual(["logo"]);
    }
  });

  it("gives A its own inputs, never inherited", () => {
    const a = resolveVariantInputs(edges, nodes, "gen", "A");
    expect(a.prompt).toEqual({ nodes: [nodes[2]], inherited: false });
    expect(a.sketch).toEqual({ nodes: [nodes[4]], inherited: false });
    expect(a.ref).toEqual({ nodes: [nodes[5]], inherited: false });
  });

  it("lets B's own input win and inherits A's input for B's unconnected handles", () => {
    const b = resolveVariantInputs(edges, nodes, "gen", "B");
    expect(b.prompt).toEqual({ nodes: [nodes[3]], inherited: false });
    expect(b.sketch).toEqual({ nodes: [nodes[4]], inherited: true });
    expect(b.ref).toEqual({ nodes: [nodes[5]], inherited: true });
  });

  it("uses C's own reference and inherits A's prompt", () => {
    const c = resolveVariantInputs(edges, nodes, "gen", "C");
    expect(c.ref).toEqual({ nodes: [nodes[6]], inherited: false });
    expect(c.prompt).toEqual({ nodes: [nodes[2]], inherited: true });
  });

  it("leaves a C input empty, not inherited, when A has nothing on that handle", () => {
    const c = resolveVariantInputs([edge("refC", "ref-in-c")], nodes, "gen", "C");
    expect(c.prompt).toEqual({ nodes: [], inherited: false });
    expect(c.sketch).toEqual({ nodes: [], inherited: false });
    expect(ids(c.ref.nodes)).toEqual(["refC"]);
  });

  it("ignores edges into other nodes and edges from deleted nodes", () => {
    const a = resolveVariantInputs([...edges, edge("ghost", "prompt-in")], nodes, "gen", "A");
    expect(ids(a.prompt.nodes)).toEqual(["pA"]);
  });

  it("classifies edges without a known handle by source type, as variant A", () => {
    const legacy = [edge("pA", null), edge("face", null), edge("skA", "image-in"), edge("logo", null), edge("refA", "")];
    const a = resolveVariantInputs(legacy, nodes, "gen", "A");
    expect(ids(a.prompt.nodes)).toEqual(["pA"]);
    expect(ids(a.face)).toEqual(["face"]);
    expect(ids(a.sketch.nodes)).toEqual(["skA"]);
    expect(ids(a.logo)).toEqual(["logo"]);
    expect(ids(a.ref.nodes)).toEqual(["refA"]);
  });

  it("keeps canvas order and lists a node connected twice once", () => {
    const a = resolveVariantInputs(
      [edge("pB", "prompt-in"), edge("pA", "prompt-in"), edge("pA", "prompt-in")],
      nodes,
      "gen",
      "A",
    );
    expect(ids(a.prompt.nodes)).toEqual(["pA", "pB"]);
  });
});

describe("edgesToRemoveForVariants", () => {
  const edges = [
    { id: "1", source: "pA", target: "gen", targetHandle: "prompt-in" },
    { id: "2", source: "pB", target: "gen", targetHandle: "prompt-in-b" },
    { id: "3", source: "skC", target: "gen", targetHandle: "sketch-in-c" },
    { id: "4", source: "face", target: "gen", targetHandle: "face-in" },
    { id: "5", source: "gen", sourceHandle: "result", target: "prevA", targetHandle: "preview-in" },
    { id: "6", source: "gen", sourceHandle: "result-b", target: "prevB", targetHandle: "preview-in" },
    { id: "7", source: "gen", sourceHandle: "result-c", target: "prevC", targetHandle: "preview-in" },
    { id: "8", source: "other-gen", sourceHandle: "result-b", target: "prevX", targetHandle: "preview-in" },
    { id: "9", source: "pX", target: "other-gen", targetHandle: "prompt-in-b" },
  ];

  it("removing C drops only C's inputs and output", () => {
    expect(ids(edgesToRemoveForVariants(edges, "gen", ["A", "B"]))).toEqual(["3", "7"]);
  });

  it("disabling the test drops every B and C edge of this generator only", () => {
    expect(ids(edgesToRemoveForVariants(edges, "gen", ["A"]))).toEqual(["2", "3", "6", "7"]);
  });

  it("drops nothing while every variant stays", () => {
    expect(edgesToRemoveForVariants(edges, "gen", ["A", "B", "C"])).toEqual([]);
  });
});

describe("variantRemovalCopy", () => {
  it("words disabling the test", () => {
    expect(variantRemovalCopy(["A", "B", "C"], ["A"], 3)).toEqual({
      title: "Désactiver le test A/B ?",
      description: "Désactiver le test A/B retire 3 branchements des variantes B et C.",
      confirmLabel: "Désactiver",
    });
    expect(variantRemovalCopy(["A", "B"], ["A"], 1).description).toBe(
      "Désactiver le test A/B retire 1 branchement de la variante B.",
    );
  });

  it("words removing C", () => {
    expect(variantRemovalCopy(["A", "B", "C"], ["A", "B"], 2)).toEqual({
      title: "Retirer la variante C ?",
      description: "Retirer la variante C retire 2 branchements de la variante C.",
      confirmLabel: "Retirer",
    });
  });
});
