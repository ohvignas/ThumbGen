import type { UIMessage } from "ai";
import { AGENT_BUSY_MESSAGE, type AgentRunsSnapshot } from "@/lib/agent/v2/run-types";

/** The 409 of a conversation where a turn already runs (DefaultChatTransport throws the response text). */
export function isAgentBusyError(error: unknown): boolean {
  return error instanceof Error && error.message.trim() === AGENT_BUSY_MESSAGE;
}

/** The refused send's optimistic user message goes away; anything else stays. */
export function withoutTrailingUserMessage(messages: UIMessage[]): UIMessage[] {
  return messages.at(-1)?.role === "user" ? messages.slice(0, -1) : messages;
}

/**
 * After a reconnection answered 204: the history is refetched when the turn was
 * running when the page looked (it has just ended) or the registry lists it now.
 */
export function resumeWithoutStreamOutcome(input: {
  conversationId: string;
  listedRunningBefore: boolean;
  runsNow: AgentRunsSnapshot;
}): { refetch: boolean; runningNow: boolean } {
  const runningNow = input.runsNow.running.some((run) => run.conversationId === input.conversationId);
  const endedNow = input.runsNow.attention.some((entry) => entry.conversationId === input.conversationId);
  return { refetch: input.listedRunningBefore || runningNow || endedNow, runningNow };
}

/** A user message nobody answers and no turn running: the turn was cut (server restart). */
export function isOrphanUserTurn(messages: UIMessage[], runningNow: boolean): boolean {
  return !runningNow && messages.at(-1)?.role === "user";
}
