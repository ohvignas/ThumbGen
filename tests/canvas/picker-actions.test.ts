import { describe, it, expect } from "vitest";
import { NODE_CATALOG } from "@/lib/canvas/node-catalog";
import { connectedNodePosition, viewportCenterPosition } from "@/lib/canvas/placement";
import { pickerBaseEntries, pickerSubtitle, planPickerAdd, type PickerNode } from "@/lib/canvas/picker-actions";

const entry = (id: string) => NODE_CATALOG.find((e) => e.id === id)!;
const nodes: PickerNode[] = [
  { id: "gen", type: "generator", position: { x: 1000, y: 400 }, data: { model: "m" } },
  { id: "logo-node", type: "swipeFile", position: { x: 200, y: 100 }, data: { kind: "logo" } },
];
const viewCenter = { x: 50, y: 60 };
const generatorDefaults = { model: "gemini-3-pro-image", aspectRatio: "16x9", numImages: 2, imageSize: "2K" };

describe("placement", () => {
  it("puts a connected node 320px left of a target handle's node, right of a source's", () => {
    expect(connectedNodePosition({ x: 1000, y: 400 }, "target")).toEqual({ x: 680, y: 400 });
    expect(connectedNodePosition({ x: 1000, y: 400 }, "source")).toEqual({ x: 1320, y: 400 });
  });

  it("converts the centre of the visible pane to flow coordinates, minus half a node", () => {
    // pane 1200×800, panned by (100, 50), zoom 2 → centre (600,400) → flow (250,175)
    expect(viewportCenterPosition({ width: 1200, height: 800 }, [100, 50, 2])).toEqual({ x: 110, y: 75 });
  });
});

describe("pickerBaseEntries", () => {
  it("offers the whole catalogue in free mode", () => {
    expect(pickerBaseEntries({ mode: "free" }, nodes)).toEqual(NODE_CATALOG);
  });

  it("offers only compatible steps in connect mode", () => {
    const fromLogoIn = pickerBaseEntries(
      { mode: "connect", from: { nodeId: "gen", handleId: "logo-in", handleType: "target" } },
      nodes,
    );
    expect(fromLogoIn.map((e) => e.id)).toEqual(["logo"]);

    const fromLogoOutput = pickerBaseEntries(
      { mode: "connect", from: { nodeId: "logo-node", handleId: "image", handleType: "source" } },
      nodes,
    );
    expect(fromLogoOutput.map((e) => e.id)).toEqual(["generateur"]);
  });

  it("offers nothing when the wire's node no longer exists", () => {
    expect(
      pickerBaseEntries({ mode: "connect", from: { nodeId: "gone", handleId: "logo-in", handleType: "target" } }, nodes),
    ).toEqual([]);
  });
});

describe("pickerSubtitle", () => {
  it("invites to start on an empty canvas, to add otherwise, and names the handle in connect mode", () => {
    expect(pickerSubtitle({ mode: "free" }, 0)).toBe("Choisis ce qui démarre ta miniature");
    expect(pickerSubtitle({ mode: "free" }, 3)).toBe("Choisis l'élément à ajouter");
    expect(
      pickerSubtitle({ mode: "connect", from: { nodeId: "gen", handleId: "logo-in", handleType: "target" } }, 3),
    ).toBe("Compatible avec « Logo »");
  });
});

describe("planPickerAdd", () => {
  it("adds a free node at the clicked position", () => {
    const plan = planPickerAdd({
      state: { mode: "free", flowPos: { x: 5, y: 6 } },
      entry: entry("prompt"),
      nodes,
      viewCenter,
      generatorDefaults,
    });
    expect(plan).toEqual({ mode: "free", nodeType: "prompt", position: { x: 5, y: 6 }, data: {} });
  });

  it("adds a free node at the view centre when no position was given", () => {
    const plan = planPickerAdd({ state: { mode: "free" }, entry: entry("logo"), nodes, viewCenter, generatorDefaults });
    expect(plan).toEqual({ mode: "free", nodeType: "swipeFile", position: viewCenter, data: { kind: "logo" } });
  });

  it("gives a new generator the generation defaults", () => {
    const plan = planPickerAdd({ state: { mode: "free" }, entry: entry("generateur"), nodes, viewCenter, generatorDefaults });
    expect(plan?.data).toEqual(generatorDefaults);
  });

  it("wires a node created from an input handle, 320px to its left", () => {
    const plan = planPickerAdd({
      state: { mode: "connect", from: { nodeId: "gen", handleId: "logo-in", handleType: "target" } },
      entry: entry("logo"),
      nodes,
      viewCenter,
      generatorDefaults,
    });
    expect(plan).toEqual({
      mode: "connect",
      nodeType: "swipeFile",
      position: { x: 680, y: 400 },
      data: { kind: "logo" },
      connectTo: "gen",
      connectToHandle: "logo-in",
      newNodeHandle: "image",
      newNodeIsTarget: false,
    });
  });

  it("wires a node created from an output handle at the drop position, on the right input", () => {
    const plan = planPickerAdd({
      state: {
        mode: "connect",
        flowPos: { x: 700, y: 120 },
        from: { nodeId: "logo-node", handleId: "image", handleType: "source" },
      },
      entry: entry("generateur"),
      nodes,
      viewCenter,
      generatorDefaults,
    });
    expect(plan).toEqual({
      mode: "connect",
      nodeType: "generator",
      position: { x: 700, y: 120 },
      data: generatorDefaults,
      connectTo: "logo-node",
      connectToHandle: "image",
      newNodeHandle: "logo-in",
      newNodeIsTarget: true,
    });
  });

  it("wires a node created from a variant input handle (prompt-in-b) to that same handle", () => {
    const plan = planPickerAdd({
      state: { mode: "connect", from: { nodeId: "gen", handleId: "prompt-in-b", handleType: "target" } },
      entry: entry("prompt"),
      nodes,
      viewCenter,
      generatorDefaults,
    });
    expect(plan).toMatchObject({ connectTo: "gen", connectToHandle: "prompt-in-b", newNodeHandle: "prompt" });
  });

  it("refuses an incompatible step or a vanished node", () => {
    const logoIn = { nodeId: "gen", handleId: "logo-in", handleType: "target" as const };
    expect(
      planPickerAdd({ state: { mode: "connect", from: logoIn }, entry: entry("prompt"), nodes, viewCenter, generatorDefaults }),
    ).toBeNull();
    expect(
      planPickerAdd({
        state: { mode: "connect", from: { ...logoIn, nodeId: "gone" } },
        entry: entry("logo"),
        nodes,
        viewCenter,
        generatorDefaults,
      }),
    ).toBeNull();
  });

  it("copies initial data instead of sharing the catalogue object", () => {
    const plan = planPickerAdd({ state: { mode: "free" }, entry: entry("logo"), nodes, viewCenter, generatorDefaults })!;
    plan.data.kind = "reference";
    expect(entry("logo").initialData).toEqual({ kind: "logo" });
  });
});
