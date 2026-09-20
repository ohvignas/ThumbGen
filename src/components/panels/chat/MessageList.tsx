"use client";
import { useLayoutEffect, useRef } from "react";
import { ArrowDownIcon } from "lucide-react";
import type { UIMessage } from "ai";
import { MessageGroup } from "@/components/ui/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
  useMessageScroller,
} from "@/components/ui/message-scroller";
import AssistantTurn from "./AssistantTurn";
import ChatEmptyState from "./ChatEmptyState";
import Message, { AssistantRow, type ChatTurnControls } from "./Message";
import TurnProgress from "./TurnProgress";
import {
  chatPinToBottomReason,
  groupConsecutiveMessages,
  lastUserMessageId,
  stoppedTurnPlacement,
  trailingAssistantRow,
} from "./chat-view-model";
import { INTERRUPTED_TURN_ERROR, emptyAssistantTurn, isBusyStatus, liveTurnError } from "./turn-model";

/** Force the viewport to the last line after a send or when a turn ends. */
function PinChatToBottom({ lastUserId, turnActive }: { lastUserId: string; turnActive: boolean }) {
  const { scrollToEnd } = useMessageScroller();
  const prevRef = useRef({ lastUserId, turnActive });
  useLayoutEffect(() => {
    const next = { lastUserId, turnActive };
    const reason = chatPinToBottomReason(prevRef.current, next);
    prevRef.current = next;
    if (reason) scrollToEnd({ behavior: "auto" });
  }, [lastUserId, turnActive, scrollToEnd]);
  return null;
}

export default function MessageList({ messages, controls }: { messages: UIMessage[]; controls: ChatTurnControls }) {
  const stopped = stoppedTurnPlacement(messages, controls.stoppedLive, controls.liveTurnStart);
  const trailing = trailingAssistantRow(messages, controls.status, stopped, controls.orphanUserTurn ?? false);

  // Empty state only when nothing is going on: a first send that failed or is
  // running before its message shows still gets its trailing row.
  if (messages.length === 0 && !trailing) {
    return <ChatEmptyState />;
  }

  const groups = groupConsecutiveMessages(messages);
  const lastMessage = messages.at(-1);
  // « Tour interrompu » lands on the last message only when the stopped turn produced it.
  const rowControls: ChatTurnControls = { ...controls, stoppedLive: stopped === "last-message" };

  return (
    <MessageScrollerProvider autoScroll defaultScrollPosition="end">
      <MessageScroller className="flex-1 border-t border-border">
        <MessageScrollerViewport>
          <MessageScrollerContent aria-busy={isBusyStatus(controls.status)} className="p-(--card-spacing)">
            {groups.map((group) => (
              <MessageScrollerItem key={group.key} messageId={group.key}>
                <MessageGroup>
                  {group.messages.map((message, index) => (
                    <Message
                      key={message.id}
                      message={message}
                      isLast={message === lastMessage}
                      showAvatar={index === group.messages.length - 1}
                      controls={rowControls}
                    />
                  ))}
                </MessageGroup>
              </MessageScrollerItem>
            ))}
            {trailing && (
              <MessageScrollerItem key="trailing-assistant" messageId="trailing-assistant">
                <AssistantRow showAvatar>
                  {trailing === "progress" ? (
                    <TurnProgress message={undefined} status={controls.status} startedAt={controls.turnStartedAt} steps={[]} />
                  ) : (
                    <AssistantTurn
                      turn={emptyAssistantTurn()}
                      error={trailing === "error" ? liveTurnError(controls.errorMessage) : INTERRUPTED_TURN_ERROR}
                      showActions={false}
                      // After an older turn's answer, the retry would replay that older message.
                      onRetry={lastMessage?.role === "assistant" ? null : controls.onRetry}
                      onAskAgent={controls.onAskAgent}
                    />
                  )}
                </AssistantRow>
              </MessageScrollerItem>
            )}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton>
          <ArrowDownIcon />
          <span className="sr-only">Aller au dernier message</span>
        </MessageScrollerButton>
      </MessageScroller>
      <PinChatToBottom lastUserId={lastUserMessageId(messages)} turnActive={isBusyStatus(controls.status)} />
    </MessageScrollerProvider>
  );
}
