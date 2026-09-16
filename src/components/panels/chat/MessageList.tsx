"use client";
import { MessageScrollerProvider, MessageScroller, MessageScrollerViewport, MessageScrollerContent, MessageScrollerItem, MessageScrollerButton } from "@/components/ui/message-scroller";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { Sparkles } from "lucide-react";
import Message from "./Message";
import type { ChatStatus, UIMessage } from "ai";

export default function MessageList({ messages, status }: { messages: UIMessage[]; status: ChatStatus }) {
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

  return (
    <MessageScrollerProvider>
      <MessageScroller className="flex-1 border-t border-border">
        <MessageScrollerViewport>
          <MessageScrollerContent className="p-(--card-spacing)">
            {messages.map((m, idx) => (
              <MessageScrollerItem key={m.id} scrollAnchor={m.role === "user"}>
                <Message message={m} isStreaming={status === "streaming" && idx === messages.length - 1} />
              </MessageScrollerItem>
            ))}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton />
      </MessageScroller>
    </MessageScrollerProvider>
  );
}
