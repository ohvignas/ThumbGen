import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Edge } from "@xyflow/react";
import { useCanvasStore, type AppNode } from "@/store/canvas-store";
import { runGenerator } from "@/components/nodes/generator/useGeneratorRun";

// loaded: false keeps history snapshots and autosave (fetch to /api/project)
// out of these tests — only /api/generate/openrouter calls matter here.
function seed(nodes: AppNode[], edges: Edge[] = []) {
  useCanvasStore.setState({
    nodes,
    edges,
    loaded: false,
    currentProjectId: "run-test",
    nodePicker: null,
  });
}

function generatorNode(): AppNode {
  return useCanvasStore.getState().nodes.find((n) => n.id === "gen")!;
}

function previewNodes(): AppNode[] {
  return useCanvasStore.getState().nodes.filter((n) => n.type === "preview");
}

function previewByLabel(label: string): AppNode {
  const node = useCanvasStore.getState().nodes.find((n) => n.type === "preview" && n.data.label === label);
  if (!node) throw new Error(`no preview labelled "${label}"`);
  return node;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("runGenerator — A/B mode", () => {
  const nodes: AppNode[] = [
    {
      id: "gen",
      type: "generator",
      position: { x: 0, y: 0 },
      data: { model: "gemini-3.1-flash-image", abTest: { variants: ["A", "B"] } },
    },
    { id: "pA", type: "prompt", position: { x: 0, y: 0 }, data: { prompt: "Prompt A" } },
    { id: "pB", type: "prompt", position: { x: 0, y: 0 }, data: { prompt: "Prompt B" } },
    { id: "sk", type: "sketch", position: { x: 0, y: 0 }, data: { imageBase64: "data:image/png;base64,AAAA" } },
  ];
  const edges: Edge[] = [
    { id: "e-pA", source: "pA", target: "gen", targetHandle: "prompt-in" },
    { id: "e-pB", source: "pB", target: "gen", targetHandle: "prompt-in-b" },
    { id: "e-sk", source: "sk", target: "gen", targetHandle: "sketch-in" },
  ];

  beforeEach(() => {
    seed(structuredClone(nodes), structuredClone(edges));
  });

  it("creates one Aperçu per variant, wired from result/result-b, titled Variante A/B, with A's sketch inherited into B's request", async () => {
    const bodies: Record<string, unknown>[] = [];
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init!.body)));
      return { ok: true, json: async () => ({ images: ["/api/images/x.png"] }) };
    });
    vi.stubGlobal("fetch", fetchMock);

    const message = await runGenerator("gen", []);
    expect(message).toBeNull();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(bodies).toHaveLength(2);
    const [bodyA, bodyB] = bodies;
    // Bodies differ only by prompt — everything else (including the
    // inherited sketch) is identical.
    expect(bodyA.prompt).toBe("Prompt A");
    expect(bodyB.prompt).toBe("Prompt B");
    expect({ ...bodyA, prompt: "" }).toEqual({ ...bodyB, prompt: "" });
    expect(bodyB.sketchImages).toEqual(["data:image/png;base64,AAAA"]);

    const previews = previewNodes();
    expect(previews).toHaveLength(2);
    const varA = previewByLabel("Variante A");
    const varB = previewByLabel("Variante B");
    expect(varA.data.genStatus).toBe("done");
    expect(varB.data.genStatus).toBe("done");

    const { edges: finalEdges } = useCanvasStore.getState();
    const edgeToA = finalEdges.find((e) => e.target === varA.id)!;
    const edgeToB = finalEdges.find((e) => e.target === varB.id)!;
    expect(edgeToA).toMatchObject({ source: "gen", sourceHandle: "result", targetHandle: "preview-in" });
    expect(edgeToB).toMatchObject({ source: "gen", sourceHandle: "result-b", targetHandle: "preview-in" });

    const gen = generatorNode();
    expect(gen.data.generatedImagesByVariant).toEqual({ A: ["/api/images/x.png"], B: ["/api/images/x.png"] });
    expect(gen.data.generatedImages).toEqual(["/api/images/x.png"]);
    expect(gen.data.isGenerating).toBe(false);
  });

  it("on B's failure: B's Aperçu gets genStatus error, generatedImagesByVariant.B is untouched, A still succeeds", async () => {
    seed(
      structuredClone(nodes).map((n) =>
        n.id === "gen" ? { ...n, data: { ...n.data, generatedImagesByVariant: { B: ["/api/images/previous-b.png"] } } } : n,
      ),
      structuredClone(edges),
    );

    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init!.body));
      if (body.prompt === "Prompt B") {
        return { ok: false, status: 500, json: async () => ({ error: "Échec du fournisseur" }) };
      }
      return { ok: true, json: async () => ({ images: ["/api/images/a.png"] }) };
    });
    vi.stubGlobal("fetch", fetchMock);

    const message = await runGenerator("gen", []);
    expect(message).toBeNull(); // per-job failures don't surface as the run's own error

    const varA = previewByLabel("Variante A");
    const varB = previewByLabel("Variante B");
    expect(varA.data.genStatus).toBe("done");
    expect(varB.data.genStatus).toBe("error");
    expect(varB.data.genError).toBe("Échec du fournisseur");

    const gen = generatorNode();
    expect(gen.data.generatedImagesByVariant).toEqual({ A: ["/api/images/a.png"], B: ["/api/images/previous-b.png"] });
    expect(gen.data.generatedImages).toEqual(["/api/images/a.png"]);
    expect(gen.data.isGenerating).toBe(false);
  });
});

describe("runGenerator — normal mode with compared models", () => {
  const nodes: AppNode[] = [
    { id: "gen", type: "generator", position: { x: 0, y: 0 }, data: { model: "gemini-3.1-flash-image" } },
    { id: "p", type: "prompt", position: { x: 0, y: 0 }, data: { prompt: "A prompt" } },
  ];
  const edges: Edge[] = [{ id: "e-p", source: "p", target: "gen", targetHandle: "prompt-in" }];

  beforeEach(() => {
    seed(structuredClone(nodes), structuredClone(edges));
  });

  it("one request per model, every edge from result, titles are model labels, images land in generatedImages", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init!.body));
      const image = body.model === "gpt-image-1" ? "/api/images/gpt.png" : "/api/images/gemini.png";
      return { ok: true, json: async () => ({ images: [image] }) };
    });
    vi.stubGlobal("fetch", fetchMock);

    const message = await runGenerator("gen", ["gpt-image-1"]);
    expect(message).toBeNull();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const previews = previewNodes();
    expect(previews).toHaveLength(2);
    expect(previews.map((p) => p.data.label).sort()).toEqual(["GPT Image 1", "Gemini 3.1 Flash"].sort());
    expect(previews.every((p) => p.data.genStatus === "done")).toBe(true);

    const { edges: finalEdges } = useCanvasStore.getState();
    for (const p of previews) {
      const edge = finalEdges.find((e) => e.target === p.id)!;
      expect(edge.sourceHandle).toBe("result");
    }

    // Normal mode has only variant A: every model's output lands in the same
    // (A) bucket, main model's job first.
    const gen = generatorNode();
    expect(gen.data.generatedImages).toEqual(["/api/images/gemini.png", "/api/images/gpt.png"]);
    expect(gen.data.isGenerating).toBe(false);
  });
});
