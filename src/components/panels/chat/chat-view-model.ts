import type { ChatStatus, UIMessage } from "ai";
import { CLIENT_TOOL_NAMES, isBusyStatus, isToolPart, readTurnMetadata, toolNameOf } from "./turn-model";

export type MessageGroupModel = { key: string; role: UIMessage["role"]; messages: UIMessage[] };

/** Consecutive messages of one author, rendered in one MessageGroup (e.g. a turn resumed after a client request). */
export function groupConsecutiveMessages(messages: UIMessage[]): MessageGroupModel[] {
  const groups: MessageGroupModel[] = [];
  for (const message of messages) {
    const last = groups.at(-1);
    if (last && last.role === message.role) last.messages.push(message);
    else groups.push({ key: message.id, role: message.role, messages: [message] });
  }
  return groups;
}

/**
 * Where the live turn started: the ids of the messages already there, and the
 * assistant message a client-request answer resumes (it keeps its id).
 */
export type LiveTurnStart = { priorMessageIds: readonly string[]; resumedMessageId: string | null };

export function liveTurnStart(messages: UIMessage[], resumedMessageId: string | null = null): LiveTurnStart {
  return { priorMessageIds: messages.map((message) => message.id), resumedMessageId };
}

/** Whether a message belongs to the live turn (created or resumed by it); true when no turn was recorded. */
export function belongsToLiveTurn(message: UIMessage, start: LiveTurnStart | null): boolean {
  if (!start) return true;
  return message.id === start.resumedMessageId || !start.priorMessageIds.includes(message.id);
}

/**
 * Where « Tour interrompu » goes after « Arrêter »: on the last message when the
 * stopped turn produced it, else as a trailing row — never on an older turn
 * (a stop can land before the new turn's first chunk or its stored user row).
 */
export type StoppedPlacement = "last-message" | "trailing" | null;

export function stoppedTurnPlacement(messages: UIMessage[], stoppedLive: boolean, start: LiveTurnStart | null): StoppedPlacement {
  if (!stoppedLive) return null;
  const last = messages.at(-1);
  return last?.role === "assistant" && belongsToLiveTurn(last, start) ? "last-message" : "trailing";
}

export type TrailingRow = "progress" | "error" | "interrupted" | null;

/**
 * The assistant row to show at the end of the list while the running (or failed, or stopped) turn has no assistant message.
 * `orphanUserTurn`: the conversation was reopened on a user message the server never answered and no turn runs.
 */
export function trailingAssistantRow(
  messages: UIMessage[],
  status: ChatStatus,
  stopped: StoppedPlacement,
  orphanUserTurn = false,
): TrailingRow {
  const last = messages.at(-1);
  // No message at all: a new conversation's first send whose user message is not shown yet.
  if (!last || last.role === "user") {
    if (isBusyStatus(status)) return "progress";
    if (status === "error") return "error";
    return stopped === "trailing" || (orphanUserTurn && last !== undefined) ? "interrupted" : null;
  }
  // The last message is an older turn's answer: the stopped turn produced nothing.
  if (!isBusyStatus(status) && status !== "error" && stopped === "trailing") return "interrupted";
  return null;
}

/** Text of the user's last message, what « Réessayer » sends again; "" when it had none. */
export function lastUserText(messages: UIMessage[]): string {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (message.role !== "user") continue;
    return message.parts
      .map((part) => (part.type === "text" ? part.text : ""))
      .join("")
      .trim();
  }
  return "";
}

/** Id of the last user message; "" when the list has none. */
export function lastUserMessageId(messages: UIMessage[]): string {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (message.role === "user") return message.id;
  }
  return "";
}

export type ChatPinSnapshot = { lastUserId: string; turnActive: boolean };

/**
 * When the list must jump to the bottom even if the user had scrolled up:
 * a new user send, or the live turn finishing (stream / tools / error).
 * Mid-stream growth stays with MessageScroller `autoScroll` (only if already at the bottom).
 */
export function chatPinToBottomReason(prev: ChatPinSnapshot, next: ChatPinSnapshot): "send" | "turn-complete" | null {
  if (next.lastUserId !== prev.lastUserId && next.lastUserId !== "") return "send";
  if (prev.turnActive && !next.turnActive) return "turn-complete";
  return null;
}

/** A client request (request_user_image / request_user_sketch) the user already answered. */
function hasAnsweredClientRequest(message: UIMessage): boolean {
  return message.parts.some(
    (part) =>
      isToolPart(part) &&
      CLIENT_TOOL_NAMES.has(toolNameOf(part)) &&
      (part.state === "output-available" || part.state === "output-error"),
  );
}

/**
 * What « Réessayer » would send again; "" when there is nothing to retry. A turn
 * that went through an answered client request can't be replayed (the answer
 * isn't part of the retry, and the server refuses such a resumption).
 */
export function retryableUserText(messages: UIMessage[]): string {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (message.role === "user") break;
    if (hasAnsweredClientRequest(message)) return "";
  }
  return lastUserText(messages);
}

/**
 * What an active-conversation change does in ChatPanel. A conversation the send
 * itself just created keeps its live messages (and error) and its starting
 * stream; any other change stops a running stream and loads the history.
 */
export function conversationChangeEffects(
  nextConversationId: string | null,
  justCreatedConversationId: string | null,
): { stopRunningTurn: boolean; loadHistory: boolean } {
  const justCreated = nextConversationId !== null && nextConversationId === justCreatedConversationId;
  return { stopRunningTurn: !justCreated, loadHistory: !justCreated };
}

/**
 * Whether a turn resumed by a client-request answer just ended and needs the
 * canonical refetch (runTurn does it for every other turn): the status went from
 * busy to ready, and the turn didn't fail (a failed turn keeps its live messages).
 */
export function shouldRefetchAfterResume(input: {
  previousStatus: ChatStatus;
  status: ChatStatus;
  resumedConversationId: string | null;
  turnFailed: boolean;
}): boolean {
  return (
    input.resumedConversationId !== null &&
    isBusyStatus(input.previousStatus) &&
    input.status === "ready" &&
    !input.turnFailed
  );
}

/**
 * The client request (request_user_image, ask_user…) the chat offers to
 * answer: an `input-available` client tool part of the last assistant
 * message — never one of a turn that was stopped or interrupted, which the
 * server will not resume (a new message abandons it instead).
 */
export function pendingClientToolPart(messages: UIMessage[], { stoppedLive }: { stoppedLive: boolean }) {
  const lastMessage = messages.at(-1);
  if (lastMessage?.role !== "assistant" || stoppedLive || readTurnMetadata(lastMessage).interrupted) return undefined;
  return lastMessage.parts.find(
    (part): part is Extract<UIMessage["parts"][number], { type: `tool-${string}` }> =>
      isToolPart(part) && CLIENT_TOOL_NAMES.has(toolNameOf(part)) && part.state === "input-available",
  );
}

/**
 * The automatic continuation of an answered client request failed (not a 409,
 * which has its own recovery): reload the stored history, so a request the
 * server never recorded as answered is offered again.
 */
/** The answer being sent, once the sending of `toolCallId` rejected (the chat may never go busy). */
export function answeringAfterFailedSend<T extends { toolCallId: string }>(current: T | null, toolCallId: string): T | null {
  return current?.toolCallId === toolCallId ? null : current;
}

export function shouldReloadAfterFailedAnswer(input: {
  previousStatus: ChatStatus;
  status: ChatStatus;
  answering: boolean;
  busyConflict: boolean;
}): boolean {
  return input.answering && !input.busyConflict && isBusyStatus(input.previousStatus) && input.status === "error";
}
