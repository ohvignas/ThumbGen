import type { NodePickerState } from "@/store/canvas-store";
import { NODE_CATALOG, compatibleEntries, handleLabel, type CatalogEntry } from "./node-catalog";
import { connectedNodePosition, type XYPosition } from "./placement";

/** The subset of a canvas node the picker needs. */
export type PickerNode = { id: string; type?: string; position: XYPosition; data: Record<string, unknown> };

export type PickerAddPlan =
  | { mode: "free"; nodeType: string; position: XYPosition; data: Record<string, unknown> }
  | {
      mode: "connect";
      nodeType: string;
      position: XYPosition;
      data: Record<string, unknown>;
      connectTo: string;
      connectToHandle: string;
      newNodeHandle: string;
      /** true when the wire comes from an output: the new node receives it. */
      newNodeIsTarget: boolean;
    };

function connectMatches(state: Extract<NodePickerState, { mode: "connect" }>, nodes: PickerNode[]) {
  const fromNode = nodes.find((node) => node.id === state.from.nodeId);
  if (!fromNode) return null;
  const matches = compatibleEntries({
    nodeType: fromNode.type ?? "",
    handleId: state.from.handleId,
    handleType: state.from.handleType,
    data: fromNode.data,
  });
  return { fromNode, matches };
}

/** Steps listed before any search: all of them, or those compatible with the wire. */
export function pickerBaseEntries(state: NodePickerState, nodes: PickerNode[]): CatalogEntry[] {
  if (state.mode === "free") return NODE_CATALOG;
  return connectMatches(state, nodes)?.matches.map((match) => match.entry) ?? [];
}

export function pickerSubtitle(state: NodePickerState, nodeCount: number): string {
  if (state.mode === "connect") return `Compatible avec « ${handleLabel(state.from.handleId)} »`;
  return nodeCount === 0 ? "Choisis ce qui démarre ta miniature" : "Choisis l'élément à ajouter";
}

/**
 * What adding `entry` means for the current picker state: which node, where,
 * with which data and, in connect mode, how to wire it. `null` when the entry
 * is not compatible (or the wire's node is gone).
 */
export function planPickerAdd({
  state,
  entry,
  nodes,
  viewCenter,
  generatorDefaults,
}: {
  state: NodePickerState;
  entry: CatalogEntry;
  nodes: PickerNode[];
  viewCenter: XYPosition;
  generatorDefaults: Record<string, unknown>;
}): PickerAddPlan | null {
  const data: Record<string, unknown> =
    entry.nodeType === "generator"
      ? { ...generatorDefaults, ...(entry.initialData ?? {}) }
      : { ...(entry.initialData ?? {}) };

  if (state.mode === "free") {
    return { mode: "free", nodeType: entry.nodeType, position: state.flowPos ?? viewCenter, data };
  }

  const found = connectMatches(state, nodes);
  const match = found?.matches.find((candidate) => candidate.entry.id === entry.id);
  if (!found || !match) return null;

  return {
    mode: "connect",
    nodeType: entry.nodeType,
    position: state.flowPos ?? connectedNodePosition(found.fromNode.position, state.from.handleType),
    data,
    connectTo: state.from.nodeId,
    connectToHandle: state.from.handleId,
    newNodeHandle: match.newNodeHandle,
    newNodeIsTarget: state.from.handleType === "source",
  };
}
