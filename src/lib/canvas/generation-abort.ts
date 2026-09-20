/** In-flight generator fetches, aborted when the UI cancels a stuck run. */
const controllers = new Map<string, AbortController>();

export function beginGeneratorRun(nodeId: string): AbortSignal {
  controllers.get(nodeId)?.abort();
  const ac = new AbortController();
  controllers.set(nodeId, ac);
  return ac.signal;
}

export function endGeneratorRun(nodeId: string, signal: AbortSignal): void {
  const current = controllers.get(nodeId);
  if (current?.signal === signal) controllers.delete(nodeId);
}

export function abortGeneratorRun(nodeId: string): void {
  const current = controllers.get(nodeId);
  if (!current) return;
  current.abort();
  controllers.delete(nodeId);
}

export function abortAllGeneratorRuns(): void {
  for (const ac of controllers.values()) ac.abort();
  controllers.clear();
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";
}
