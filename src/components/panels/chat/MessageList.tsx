"use client";
import { ArrowDownIcon, Sparkles } from "lucide-react";
import type { UIMessage } from "ai";
import { MessageGroup } from "@/components/ui/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import AssistantTurn from "./AssistantTurn";
import Message, { AssistantRow, type ChatTurnControls } from "./Message";
import TurnProgress from "./TurnProgress";
import { groupConsecutiveMessages, trailingAssistantRow } from "./chat-view-model";
import { INTERRUPTED_TURN_ERROR, emptyAssistantTurn, isBusyStatus, liveTurnError } from "./turn-model";

/** Pixels of the previous turn kept visible above a newly anchored user message. */
const PREVIOUS_ITEM_PEEK_PX = 48;

export default function MessageList({ messages, controls }: { messages: UIMessage[]; controls: ChatTurnControls }) {
  if (messages.length === 0) {
    return (
      <Empty className="flex-1 border-none">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Sparkles />
          </EmptyMedia>
          <EmptyTitle>On commence par quoi ?</EmptyTitle>
          <EmptyDescription>
            Décris ta miniature, joins une image ou enregistre un vocal.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const groups = groupConsecutiveMessages(messages);
  const lastMessage = messages[messages.length - 1];
  const trailing = trailingAssistantRow(messages, controls.status, controls.stoppedLive);

  return (
    <MessageScrollerProvider autoScroll defaultScrollPosition="last-anchor" scrollPreviousItemPeek={PREVIOUS_ITEM_PEEK_PX}>
      <MessageScroller className="flex-1 border-t border-border">
        <MessageScrollerViewport>
          <MessageScrollerContent aria-busy={isBusyStatus(controls.status)} className="p-(--card-spacing)">
            {groups.map((group) => (
              <MessageScrollerItem key={group.key} messageId={group.key} scrollAnchor={group.role === "user"}>
                <MessageGroup>
                  {group.messages.map((message, index) => (
                    <Message
                      key={message.id}
                      message={message}
                      isLast={message === lastMessage}
                      showAvatar={index === group.messages.length - 1}
                      controls={controls}
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
                      onRetry={controls.onRetry}
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
    </MessageScrollerProvider>
  );
}
