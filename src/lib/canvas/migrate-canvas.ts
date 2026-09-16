import type { Edge } from "@xyflow/react";
import type { AppNode, NodeData } from "@/store/canvas-store";

/**
 * Lazy, load-time migrations of a saved canvas. Pure: returns new arrays and
 * whether anything changed, so the store can let the normal autosave persist
 * the result.
 *
 * 1. Edges saved before the generator handle rename point at "image-in";
 *    it is "ref-in" now.
 * 2. Faces are Personnages only. A faceReference holding a single photo (no
 *    persona) becomes a reference image (swipeFile, kind "reference") keeping
 *    its image and label; its wires move from face → face-in to
 *    image → ref-in. Empty face nodes and Personnage nodes are untouched.
 */
export function migrateCanvas(
  nodes: AppNode[],
  edges: Edge[],
): { nodes: AppNode[]; edges: Edge[]; changed: boolean } {
  let changed = false;
  const converted = new Set<string>();
  const nodeTypeById = new Map(nodes.map((n) => [n.id, n.type]));

  const nextNodes = nodes.map((node) => {
    if (node.type !== "faceReference") return node;
    const data = node.data ?? {};
    const angles = data.personaAngles;
    const hasPersona = Boolean(data.personaId || (angles && (angles.front || angles.left || angles.right)));
    const hasImage = Boolean(data.imageBase64 || data.imageUrl);
    if (hasPersona || !hasImage) return node;

    converted.add(node.id);
    changed = true;
    const nextData: NodeData = { kind: "reference" };
    if (data.imageUrl) nextData.imageUrl = data.imageUrl;
    if (data.imageBase64) nextData.imageBase64 = data.imageBase64;
    if (data.label) nextData.label = data.label;
    return { ...node, type: "swipeFile", data: nextData };
  });

  const nextEdges = edges.map((edge) => {
    let next = edge;
    // Only generators had an "image-in" handle before the rename (now
    // "ref-in") — Texte overlay's real input handle has always been called
    // "image-in", so rewriting it there would strand an Aperçu → Texte
    // overlay wire on a handle Texte overlay doesn't have.
    if (next.targetHandle === "image-in" && nodeTypeById.get(next.target) === "generator") {
      next = { ...next, targetHandle: "ref-in" };
      changed = true;
    }
    if (converted.has(next.source)) {
      if (next.sourceHandle === "face") {
        next = { ...next, sourceHandle: "image" };
        changed = true;
      }
      if (next.targetHandle === "face-in") {
        next = { ...next, targetHandle: "ref-in" };
        changed = true;
      }
    }
    return next;
  });

  return { nodes: nextNodes, edges: nextEdges, changed };
}
