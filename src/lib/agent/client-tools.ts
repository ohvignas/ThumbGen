/**
 * Names of the agent's client tools: tools without `execute` that pause the
 * turn until the chat panel answers them (PendingUiAction). Single source for
 * the chat route (abandon scan, resume filter), the auto-continuation
 * predicate, the turn model, the chat panel and the runs registry.
 * Pure — safe to import from client code.
 */
export const CLIENT_TOOL_NAMES = ["request_user_image", "request_user_sketch", "ask_user"] as const;

export type ClientToolName = (typeof CLIENT_TOOL_NAMES)[number];

export const CLIENT_TOOL_NAME_SET: ReadonlySet<string> = new Set(CLIENT_TOOL_NAMES);

export function isClientToolName(name: string): name is ClientToolName {
  return CLIENT_TOOL_NAME_SET.has(name);
}

/** `tool-ask_user` → `ask_user`; null for any part type that is not a client tool. */
export function clientToolNameOfPartType(type: string): ClientToolName | null {
  if (!type.startsWith("tool-")) return null;
  const name = type.slice("tool-".length);
  return isClientToolName(name) ? name : null;
}
