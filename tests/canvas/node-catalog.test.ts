import { describe, it, expect } from "vitest";
import {
  NODE_CATALOG,
  CATALOG_CATEGORIES,
  catalogIdForNode,
  compatibleEntries,
  handleLabel,
  normalizeSearchText,
  searchCatalog,
} from "@/lib/canvas/node-catalog";

const ids = (entries: { id: string }[]) => entries.map((e) => e.id);
const pairs = (matches: ReturnType<typeof compatibleEntries>) =>
  matches.map((m) => `${m.entry.id}:${m.newNodeHandle}`);

describe("NODE_CATALOG", () => {
  it("lists the v1 steps in display order", () => {
    expect(ids(NODE_CATALOG)).toEqual([
      "prompt",
      "personnage",
      "reference",
      "logo",
      "croquis",
      "generateur",
      "texte",
      "apercu",
    ]);
  });

  it("keeps each category contiguous and in CATALOG_CATEGORIES order", () => {
    const order = CATALOG_CATEGORIES.map((c) => c.id);
    const seen = NODE_CATALOG.map((e) => order.indexOf(e.category));
    expect(seen).toEqual([...seen].sort((a, b) => a - b));
    expect(CATALOG_CATEGORIES.map((c) => c.label)).toEqual(["Entrées", "Génération", "Finition"]);
  });

  it("only accepts catalogue ids that exist and have an output", () => {
    const byId = new Map(NODE_CATALOG.map((e) => [e.id, e]));
    for (const entry of NODE_CATALOG) {
      for (const input of entry.inputs) {
        for (const accepted of input.accepts) {
          expect(byId.get(accepted)?.output, `${entry.id}.${input.handle} ← ${accepted}`).toBeDefined();
        }
      }
    }
  });

  it("maps logo and reference to swipeFile with their kind", () => {
    const logo = NODE_CATALOG.find((e) => e.id === "logo")!;
    const reference = NODE_CATALOG.find((e) => e.id === "reference")!;
    expect(logo).toMatchObject({ nodeType: "swipeFile", initialData: { kind: "logo" }, output: { handle: "image" } });
    expect(reference).toMatchObject({ nodeType: "swipeFile", initialData: { kind: "reference" }, output: { handle: "image" } });
  });
});

describe("searchCatalog", () => {
  it("returns every entry, in order, for an empty or blank query", () => {
    expect(ids(searchCatalog(""))).toEqual(ids(NODE_CATALOG));
    expect(ids(searchCatalog("   "))).toEqual(ids(NODE_CATALOG));
  });

  it("ignores case and accents", () => {
    expect(normalizeSearchText("Aperçu GÉNÉRATEUR")).toBe("apercu generateur");
    expect(ids(searchCatalog("apercu"))).toEqual(["apercu"]);
    expect(ids(searchCatalog("GÉNÉRATEUR"))).toEqual(["generateur"]);
  });

  it("matches keywords", () => {
    expect(ids(searchCatalog("visage"))).toEqual(["personnage"]);
    expect(ids(searchCatalog("marque"))).toEqual(["logo"]);
    expect(ids(searchCatalog("dessin"))).toEqual(["croquis"]);
  });

  it("matches title, description and keywords while keeping catalogue order", () => {
    expect(ids(searchCatalog("image"))).toEqual(["reference", "generateur", "texte"]);
  });

  it("requires every word of a multi-word query", () => {
    expect(ids(searchCatalog("image reference"))).toEqual(["reference"]);
  });

  it("returns nothing when no entry matches", () => {
    expect(searchCatalog("zzz")).toEqual([]);
  });

  it("filters the given entries instead of the full catalogue", () => {
    const subset = NODE_CATALOG.filter((e) => e.id === "apercu" || e.id === "texte");
    expect(ids(searchCatalog("", subset))).toEqual(["texte", "apercu"]);
    expect(ids(searchCatalog("logo", subset))).toEqual([]);
  });
});

describe("catalogIdForNode", () => {
  it("resolves plain node types to their entry", () => {
    expect(catalogIdForNode({ type: "prompt" })).toBe("prompt");
    expect(catalogIdForNode({ type: "faceReference" })).toBe("personnage");
    expect(catalogIdForNode({ type: "sketch" })).toBe("croquis");
    expect(catalogIdForNode({ type: "generator" })).toBe("generateur");
    expect(catalogIdForNode({ type: "textOverlay" })).toBe("texte");
    expect(catalogIdForNode({ type: "preview" })).toBe("apercu");
    expect(catalogIdForNode({ type: "unknown" })).toBeUndefined();
  });

  it("tells a logo swipeFile from a reference one", () => {
    expect(catalogIdForNode({ type: "swipeFile", data: { kind: "logo" } })).toBe("logo");
    expect(catalogIdForNode({ type: "swipeFile", data: { imageUrl: "/api/logos/image?f=abc" } })).toBe("logo");
    expect(catalogIdForNode({ type: "swipeFile", data: { image_source: "stored:lg_abc" } })).toBe("logo");
    expect(catalogIdForNode({ type: "swipeFile", data: { kind: "reference" } })).toBe("reference");
    expect(catalogIdForNode({ type: "swipeFile" })).toBe("reference");
  });
});

describe("compatibleEntries — wire dragged from an input (target) handle", () => {
  const target = (nodeType: string, handleId: string) =>
    pairs(compatibleEntries({ nodeType, handleId, handleType: "target" }));

  it("generator inputs", () => {
    expect(target("generator", "prompt-in")).toEqual(["prompt:prompt"]);
    expect(target("generator", "face-in")).toEqual(["personnage:face"]);
    expect(target("generator", "ref-in")).toEqual(["reference:image", "texte:result", "apercu:preview-out"]);
    expect(target("generator", "logo-in")).toEqual(["logo:image"]);
    expect(target("generator", "sketch-in")).toEqual(["croquis:image"]);
  });

  it("text overlay and preview inputs", () => {
    expect(target("textOverlay", "image-in")).toEqual(["generateur:result", "apercu:preview-out"]);
    expect(target("preview", "preview-in")).toEqual(["generateur:result", "texte:result"]);
  });

  it("returns nothing for an unknown handle", () => {
    expect(target("generator", "prompt-in-z")).toEqual([]);
    expect(target("nope", "prompt-in")).toEqual([]);
  });
});

describe("compatibleEntries — wire dragged from an output (source) handle", () => {
  const source = (nodeType: string, handleId: string, data?: Record<string, unknown>) =>
    pairs(compatibleEntries({ nodeType, handleId, handleType: "source", data }));

  it("inputs plug into the matching generator handle", () => {
    expect(source("prompt", "prompt")).toEqual(["generateur:prompt-in"]);
    expect(source("faceReference", "face")).toEqual(["generateur:face-in"]);
    expect(source("sketch", "image")).toEqual(["generateur:sketch-in"]);
  });

  it("a Logo goes to logo-in, a reference image to ref-in", () => {
    expect(source("swipeFile", "image", { kind: "logo" })).toEqual(["generateur:logo-in"]);
    expect(source("swipeFile", "image", { imageUrl: "/api/logos/image?f=x" })).toEqual(["generateur:logo-in"]);
    expect(source("swipeFile", "image", { kind: "reference" })).toEqual(["generateur:ref-in"]);
    expect(source("swipeFile", "image")).toEqual(["generateur:ref-in"]);
  });

  it("results feed the finishing steps", () => {
    expect(source("generator", "result")).toEqual(["texte:image-in", "apercu:preview-in"]);
    expect(source("textOverlay", "result")).toEqual(["generateur:ref-in", "apercu:preview-in"]);
    expect(source("preview", "preview-out")).toEqual(["generateur:ref-in", "texte:image-in"]);
  });

  it("returns nothing when the handle is not the node's output", () => {
    expect(source("generator", "prompt-in")).toEqual([]);
    expect(source("nope", "result")).toEqual([]);
  });
});

describe("handleLabel", () => {
  it("names handles in French and falls back to the raw id", () => {
    expect(handleLabel("logo-in")).toBe("Logo");
    expect(handleLabel("ref-in")).toBe("Image de référence");
    expect(handleLabel("result")).toBe("Résultat");
    expect(handleLabel("mystery")).toBe("mystery");
  });
});
