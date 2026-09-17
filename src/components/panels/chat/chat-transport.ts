import { DefaultChatTransport, type UIMessage } from "ai";
import { clientToolNameOfPartType } from "@/lib/agent/client-tools";

export const AGENT_CHAT_API = "/api/agent/chat";

/** GET: replays the running turn, 204 when none runs. */
export function agentStreamUrl(conversationId: string | null): string {
  return `${AGENT_CHAT_API}/${encodeURIComponent(conversationId ?? "none")}/stream`;
}

export function agentStopUrl(conversationId: string): string {
  return `${AGENT_CHAT_API}/${encodeURIComponent(conversationId)}/stop`;
}

type ToolPartFields = { toolCallId?: unknown; state?: unknown; output?: unknown; errorText?: unknown };

/**
 * The last message reduced to what POST /api/agent/chat reads (route-handler.ts
 * rebuilds all prior context from the DB): the text parts of a user turn, or the
 * resolved client-tool parts of a continuation. File parts and server tool
 * outputs (generate_sketch's base64 images…) never go over the wire.
 */
export function trimMessageForServer(message: UIMessage): UIMessage {
  const parts: UIMessage["parts"] = [];
  for (const part of message.parts) {
    if (part.type === "text") {
      // The route reads text only on a user turn.
      if (message.role === "user") parts.push({ type: "text", text: part.text });
      continue;
    }
    if (clientToolNameOfPartType(part.type) === null) continue;
    const tool = part as ToolPartFields;
    if (tool.state === "output-available") {
      parts.push({ type: part.type, toolCallId: tool.toolCallId, state: tool.state, output: tool.output } as UIMessage["parts"][number]);
    } else if (tool.state === "output-error") {
      parts.push({ type: part.type, toolCallId: tool.toolCallId, state: tool.state, errorText: tool.errorText } as UIMessage["parts"][number]);
    }
  }
  return { id: message.id, role: message.role, parts };
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
    // Only the last message: a long history (base64 tool outputs) went over the
    // 10 MB request limit, got truncated and failed every send of the conversation.
    prepareSendMessagesRequest: ({ id, messages, body, trigger, messageId }) => {
      const last = messages.at(-1);
      return { body: { ...body, id, messages: last ? [trimMessageForServer(last)] : [], trigger, messageId } };
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
