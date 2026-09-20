/** Visible sketch nodes in a canvas snapshot. Tombstones are not in this list. */
export function countSketchNodes(nodes: readonly { type?: string }[]): number {
  return nodes.filter((node) => node.type === "sketch").length;
}
