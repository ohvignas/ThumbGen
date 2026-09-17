import type { ChatStatus, UIMessage } from "ai";
import { isBusyStatus } from "./turn-model";

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

export type TrailingRow = "progress" | "error" | "interrupted" | null;

/** The assistant row to show after the user's last message while no assistant message exists for it. */
export function trailingAssistantRow(messages: UIMessage[], status: ChatStatus, stoppedLive: boolean): TrailingRow {
  const last = messages.at(-1);
  if (!last || last.role !== "user") return null;
  if (isBusyStatus(status)) return "progress";
  if (status === "error") return "error";
  if (stoppedLive) return "interrupted";
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
