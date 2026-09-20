/** In-flight generate: spinner on the generator or a loading Aperçu. */
export function isInFlightGenerationData(data: { isGenerating?: unknown; genStatus?: unknown } | undefined): boolean {
  return Boolean(data?.isGenerating || data?.genStatus === "loading");
}

export function isCanvasGenerating(
  nodes: readonly { data?: { isGenerating?: unknown; genStatus?: unknown } }[],
): boolean {
  return nodes.some((node) => isInFlightGenerationData(node.data));
}

/**
 * Poll merge uses the server node as the base. Keep a local in-flight
 * generation or a richer image list so a save/poll cannot blank the loader.
 */
export function keepLocalGenerationNodes<N extends { id: string; data?: Record<string, unknown> }>(
  merged: N[],
  local: N[],
): N[] {
  const localById = new Map(local.map((node) => [node.id, node]));
  return merged.map((node) => {
    const live = localById.get(node.id);
    if (!live) return node;
    if (isInFlightGenerationData(live.data)) return live;
    const localImages = Array.isArray(live.data?.generatedImages) ? live.data.generatedImages.length : 0;
    const serverImages = Array.isArray(node.data?.generatedImages) ? node.data.generatedImages.length : 0;
    return localImages > serverImages ? live : node;
  });
}

/**
 * Controlled React Flow: a poll/setNodes must not reset x/y the user just
 * moved via onNodesChange / applyNodeChanges (snap-back after ~2s).
 */
export function keepLocalNodePositions<N extends { id: string; position?: { x: number; y: number } }>(
  incoming: N[],
  local: readonly N[],
): N[] {
  if (local.length === 0) return incoming;
  const localById = new Map(local.map((node) => [node.id, node]));
  return incoming.map((node) => {
    const live = localById.get(node.id);
    if (!live?.position) return node;
    if (node.position?.x === live.position.x && node.position?.y === live.position.y) return node;
    return { ...node, position: { x: live.position.x, y: live.position.y } };
  });
}
