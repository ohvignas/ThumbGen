/**
 * In-process registry of UI tool calls awaiting browser response.
 *
 * When the agent loop emits a `ui_tool_request` SSE event, it calls
 * `registerPending(toolUseId)` and awaits the returned promise. The browser
 * later POSTs to /api/agent/chat/tool-result, which calls `resolvePending`,
 * which resolves the awaiting promise with the user's input.
 *
 * Caveat: this is process-local. If you horizontally scale the Next.js server,
 * route the tool-result POST to the same instance (sticky session) or move
 * to Redis. For mono-user / single-process this is fine.
 */

type Resolver<T = unknown> = (result: T) => void;

const pending = new Map<string, Resolver>();

/**
 * Register a pending UI tool call. Returns a promise that resolves when
 * resolvePending is called with the same toolUseId.
 *
 * If a pending entry with the same id already exists, this overwrites it
 * (the previous waiter will hang forever — this should not happen in practice
 * since toolUseIds come from the Anthropic API and are globally unique).
 */
export function registerPending<T = unknown>(toolUseId: string): Promise<T> {
  return new Promise<T>((resolve) => {
    pending.set(toolUseId, resolve as Resolver);
  });
}

/**
 * Resolves a pending UI tool call. Returns true if there was a waiter,
 * false if the toolUseId is unknown (already resolved, expired, or never
 * registered).
 */
export function resolvePending(toolUseId: string, result: unknown): boolean {
  const r = pending.get(toolUseId);
  if (!r) return false;
  pending.delete(toolUseId);
  r(result);
  return true;
}

/**
 * Removes a single pending entry without resolving it. Use this when the
 * waiter has been abandoned (e.g. agent loop aborted while UI tool was
 * pending) to prevent a memory leak.
 */
export function abandonPending(toolUseId: string): void {
  pending.delete(toolUseId);
}

/** For testing only. */
export function _clearPending(): void {
  pending.clear();
}
