import type { ChatStatus, UIMessage } from "ai";
import type { StopResult } from "./chat-transport";
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

export type StopFollowUp = "none" | "local-stop" | "retry-now" | "retry-when-streaming";

/**
 * What « Arrêter » does once POST …/stop answered. `not-running` while the
 * request is still submitted means the server has not registered the turn
 * yet (re-sent at the first chunk); while already streaming, the run may have
 * registered in between, so it is re-sent at once — only once, since a turn
 * that really ended ends its stream by itself.
 */
export function stopFollowUp(input: { result: StopResult; status: ChatStatus; retried: boolean }): StopFollowUp {
  if (input.result === "failed") return "local-stop";
  if (input.result === "stopped") return "none";
  if (input.status === "submitted") return "retry-when-streaming";
  if (input.status === "streaming" && !input.retried) return "retry-now";
  return "none";
}
