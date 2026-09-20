import { describe, it, expect } from "vitest";
import {
  asDeletedIds,
  exceptLiveTombstones,
  filterTombstonedCanvas,
  mergeLocalOnlyCanvas,
  mergeTombstones,
  nextDeletedIds,
  unionDeletedIds,
} from "@/lib/canvas/tombstones";

describe("nextDeletedIds", () => {
  it("records ids that left the canvas and forgets ids that came back", () => {
    expect(nextDeletedIds([{ id: "a" }, { id: "b" }], [{ id: "a" }], [])).toEqual(["b"]);
    expect(nextDeletedIds([{ id: "a" }], [{ id: "a" }, { id: "b" }], ["b"])).toEqual([]);
  });

  it("keeps an earlier tombstone when the id stays absent", () => {
    expect(nextDeletedIds([{ id: "a" }], [{ id: "a" }], ["gone"])).toEqual(["gone"]);
  });
});

describe("asDeletedIds", () => {
  it("keeps unique non-empty strings", () => {
    expect(asDeletedIds(["a", "", "a", 1, "b"])).toEqual(["a", "b"]);
    expect(asDeletedIds(undefined)).toEqual([]);
  });
});

describe("unionDeletedIds / mergeTombstones", () => {
  it("merges client and server tomb lists without duplicates", () => {
    expect(unionDeletedIds(["a", "b"], [], ["b", "c"])).toEqual(["a", "b", "c"]);
    expect(mergeTombstones({ nodeIds: ["n1"], edgeIds: [] }, { nodeIds: ["n2", "n1"], edgeIds: ["e1"] })).toEqual({
      nodeIds: ["n1", "n2"],
      edgeIds: ["e1"],
    });
  });
});

describe("exceptLiveTombstones", () => {
  it("drops tombstone ids that are still on the live canvas", () => {
    expect(
      exceptLiveTombstones(
        { nodeIds: ["prompt-live", "prompt-gone"], edgeIds: ["e-live", "e-gone"] },
        [{ id: "prompt-live" }],
        [{ id: "e-live" }],
      ),
    ).toEqual({ nodeIds: ["prompt-gone"], edgeIds: ["e-gone"] });
  });
});

describe("filterTombstonedCanvas", () => {
  it("drops tombstoned nodes and dangling edges", () => {
    const filtered = filterTombstonedCanvas(
      [
        { id: "a", type: "prompt" },
        { id: "b", type: "generator" },
      ],
      [{ id: "e", source: "a", target: "b" }],
      { nodeIds: ["b"], edgeIds: [] },
    );
    expect(filtered.nodes.map((node) => node.id)).toEqual(["a"]);
    expect(filtered.edges).toEqual([]);
  });
});

describe("mergeLocalOnlyCanvas", () => {
  const a = { id: "a", type: "prompt" };
  const b = { id: "b", type: "generator" };
  const c = { id: "c", type: "prompt" };
  const edgeAB = { id: "e-ab", source: "a", target: "b", targetHandle: "prompt-in" };
  const edgeAC = { id: "e-ac", source: "a", target: "c", targetHandle: "prompt-in" };

  it("keeps a local-only add the server snapshot has not seen", () => {
    const merged = mergeLocalOnlyCanvas([a], [], [a, b], []);
    expect(merged.nodes.map((node) => node.id)).toEqual(["a", "b"]);
  });

  it("does not resurrect a tombstoned node from the server snapshot", () => {
    const merged = mergeLocalOnlyCanvas([a, b], [edgeAB], [a], [], { nodeIds: ["b"], edgeIds: ["e-ab"] });
    expect(merged.nodes.map((node) => node.id)).toEqual(["a"]);
    expect(merged.edges).toEqual([]);
  });

  it("keeps an add and a delete together", () => {
    const merged = mergeLocalOnlyCanvas([a, b], [edgeAB], [a, c], [edgeAC], { nodeIds: ["b"], edgeIds: ["e-ab"] });
    expect(merged.nodes.map((node) => node.id)).toEqual(["a", "c"]);
    expect(merged.edges.map((edge) => edge.id)).toEqual(["e-ac"]);
  });
});
