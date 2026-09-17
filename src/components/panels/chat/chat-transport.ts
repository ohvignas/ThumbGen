import { DefaultChatTransport, type UIMessage } from "ai";

export const AGENT_CHAT_API = "/api/agent/chat";

/** GET: replays the running turn, 204 when none runs. */
export function agentStreamUrl(conversationId: string | null): string {
  return `${AGENT_CHAT_API}/${encodeURIComponent(conversationId ?? "none")}/stream`;
}

export function agentStopUrl(conversationId: string): string {
  return `${AGENT_CHAT_API}/${encodeURIComponent(conversationId)}/stop`;
}

/**
 * The chat's transport: sends to POST /api/agent/chat as before, and reconnects
 * (useChat's resumeStream) to the ACTIVE conversation's run — never to useChat's
 * own local chat id. `onReconnectStatus` reports each GET's HTTP status (200
 * replay, 204 nothing runs), which resumeStream() itself does not expose.
 */
export function createAgentChatTransport({
  getConversationId,
  onReconnectStatus,
  fetch: fetchImpl,
}: {
  getConversationId: () => string | null;
  onReconnectStatus?: (status: number) => void;
  fetch?: typeof fetch;
}): DefaultChatTransport<UIMessage> {
  return new DefaultChatTransport<UIMessage>({
    api: AGENT_CHAT_API,
    fetch: async (input, init) => {
      const response = await (fetchImpl ?? globalThis.fetch)(input, init);
      if ((init?.method ?? "GET").toUpperCase() === "GET") onReconnectStatus?.(response.status);
      return response;
    },
    prepareReconnectToStreamRequest: () => ({ api: agentStreamUrl(getConversationId()) }),
  });
}

export type StopResult = "stopped" | "not-running" | "failed";

/** « Arrêter »: the server aborts the turn and saves it; the stream then ends by itself. */
export async function stopAgentRun(conversationId: string, fetchImpl: typeof fetch = globalThis.fetch): Promise<StopResult> {
  try {
    const response = await fetchImpl(agentStopUrl(conversationId), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    if (!response.ok) return "failed";
    const data = (await response.json()) as { stopped?: unknown };
    return data.stopped === true ? "stopped" : "not-running";
  } catch {
    return "failed";
  }
}
