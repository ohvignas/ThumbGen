/**
 * « Générer » from the chat (finish_turn's `generate` action, chantier F2):
 * the chat asks the generator node to run through a window event, so the
 * node's own run (and all its guards) is the only code that starts a paid
 * generation. Dispatched only from a click handler — never from an effect,
 * never stored, never replayed.
 */
export const GENERATE_NODE_EVENT = "thumbgen:generate-node";

export type GenerateNodeEventDetail = { nodeId: string };

export function requestNodeGeneration(nodeId: string): void {
  window.dispatchEvent(new CustomEvent<GenerateNodeEventDetail>(GENERATE_NODE_EVENT, { detail: { nodeId } }));
}

/** Calls `onRequest` each time a generation of `nodeId` is requested; returns the unsubscribe. */
export function subscribeNodeGeneration(nodeId: string, onRequest: () => void): () => void {
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<GenerateNodeEventDetail | undefined>).detail;
    if (detail?.nodeId === nodeId) onRequest();
  };
  window.addEventListener(GENERATE_NODE_EVENT, listener);
  return () => window.removeEventListener(GENERATE_NODE_EVENT, listener);
}
