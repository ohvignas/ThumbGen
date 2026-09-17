"use client";
import { useMemo, type ReactNode } from "react";
import type { ChatStatus, UIMessage } from "ai";
import { Message as MessageRow, MessageAvatar, MessageContent } from "@/components/ui/message";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { useChatStore } from "@/store/chat-store";
import AgentAvatar from "./AgentAvatar";
import AssistantTurn from "./AssistantTurn";
import TurnProgress from "./TurnProgress";
import { TextMarkdown } from "./TextMarkdown";
import { splitAssistantTurn, turnDisplay } from "./turn-model";
import type { LiveTurnStart } from "./chat-view-model";

/** What every message row needs from ChatPanel. */
export type ChatTurnControls = {
  status: ChatStatus;
  errorMessage: string | null;
  /** Start of the running turn, for the live timer. */
  turnStartedAt: number | null;
  /** The user pressed « Arrêter » in this conversation since the last send. */
  stoppedLive: boolean;
  /** Messages present when the running turn started, so a stop never marks an older turn. */
  liveTurnStart: LiveTurnStart | null;
  onAskAgent: (message: string) => void;
  /** Re-runs the last user message; null when there is nothing to retry. */
  onRetry: (() => void) | null;
};

function UserMessage({ message }: { message: UIMessage }) {
  const openAnnotate = useChatStore((s) => s.openAnnotate);
  return (
    <MessageRow align="end">
      <MessageContent>
        <Bubble align="end" variant="tinted">
          <BubbleContent>
            {message.parts.map((part, i) => {
              if (part.type === "text") return <TextMarkdown key={i} text={part.text} openAnnotate={openAnnotate} />;
              if (part.type === "file" && part.mediaType?.startsWith("image/")) {
                return (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} src={part.url} alt="image" onClick={() => openAnnotate(part.url)}
                    className="max-w-[240px] rounded my-1 border border-border cursor-zoom-in" />
                );
              }
              return null;
            })}
          </BubbleContent>
        </Bubble>
      </MessageContent>
    </MessageRow>
  );
}

/** An assistant row: the agent's avatar (empty slot for earlier messages of a group) and the turn. */
export function AssistantRow({ showAvatar, children }: { showAvatar: boolean; children: ReactNode }) {
  return (
    <MessageRow align="start">
      <MessageAvatar className="min-w-9 rounded-xl bg-transparent">{showAvatar && <AgentAvatar />}</MessageAvatar>
      <MessageContent>{children}</MessageContent>
    </MessageRow>
  );
}

function AssistantMessage({
  message,
  isLast,
  showAvatar,
  controls,
}: {
  message: UIMessage;
  isLast: boolean;
  showAvatar: boolean;
  controls: ChatTurnControls;
}) {
  const turn = useMemo(() => splitAssistantTurn(message), [message]);
  const display = turnDisplay({
    isLast,
    status: controls.status,
    errorMessage: controls.errorMessage,
    stoppedLive: controls.stoppedLive,
    interrupted: turn.interrupted,
  });

  return (
    <AssistantRow showAvatar={showAvatar}>
      {display.mode === "progress" ? (
        <TurnProgress message={message} status={controls.status} startedAt={controls.turnStartedAt} steps={turn.steps} />
      ) : (
        <AssistantTurn
          turn={turn}
          error={display.error}
          showActions={display.showActions}
          onRetry={display.canRetry ? controls.onRetry : null}
          onAskAgent={controls.onAskAgent}
        />
      )}
    </AssistantRow>
  );
}

export default function Message({
  message,
  isLast,
  showAvatar,
  controls,
}: {
  message: UIMessage;
  isLast: boolean;
  showAvatar: boolean;
  controls: ChatTurnControls;
}) {
  if (message.role === "user") return <UserMessage message={message} />;
  return <AssistantMessage message={message} isLast={isLast} showAvatar={showAvatar} controls={controls} />;
}
