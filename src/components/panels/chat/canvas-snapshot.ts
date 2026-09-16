import { summarizeAbTest } from "@/lib/canvas/generator-variants";

export type SnapshotNode = { id: string; type?: string; data?: Record<string, unknown> };
export type SnapshotEdge = { source: string; target: string; targetHandle?: string | null };

/**
 * Compact canvas description sent with every agent turn (`canvas_snapshot`),
 * rendered into the system prompt as <canvas_state>. No binary image data.
 */
export function snapshotCanvas(nodes: SnapshotNode[], edges: SnapshotEdge[]): unknown {
  return {
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.type,
      summary: summarizeNode(n.type ?? "", n.data ?? {}),
    })),
    edges: edges.map((e) => ({ source: e.source, target: e.target, targetHandle: e.targetHandle })),
  };
}

export function summarizeNode(type: string, data: Record<string, unknown>): Record<string, unknown> {
  switch (type) {
    case "prompt":
      return { prompt: data.prompt, negativePrompt: data.negativePrompt };
    case "generator":
      // Generator nodes use `count` — `numImages` was a documentation error.
      return {
        model: data.model,
        aspectRatio: data.aspectRatio,
        count: data.count ?? data.numImages,
        abTest: summarizeAbTest(data.abTest),
      };
    case "faceReference":
      return {
        persona: typeof data.personaId === "string" ? `stored:persona_${data.personaId}` : null,
        label: data.label,
      };
    case "swipeFile":
    case "sketch":
      return {
        hasImage: Boolean(data.imageBase64 || data.imageUrl),
        label: data.label,
      };
    default:
      return {};
  }
}
