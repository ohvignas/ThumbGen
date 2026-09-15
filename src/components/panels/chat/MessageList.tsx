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
          <EmptyMedia variant="icon" className="w-11 h-11 rounded-xl bg-primary/10 border border-border">
            <Sparkles size={18} className="text-primary" strokeWidth={1.75} />
          </EmptyMedia>
          <EmptyTitle className="italic text-[28px] font-normal tracking-[-0.015em] leading-tight text-foreground">
            on commence <br />par quoi ?
          </EmptyTitle>
          <EmptyDescription className="text-[11px] mt-1 tracking-[0.18em] uppercase font-mono text-muted-foreground">
            Texte · Image · Vocal
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <MessageScrollerProvider>
      <MessageScroller className="flex-1 border-t border-border">
        <MessageScrollerViewport>
          <MessageScrollerContent>
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
