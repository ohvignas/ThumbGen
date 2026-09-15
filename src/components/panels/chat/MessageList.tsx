"use client";
import { MessageScrollerProvider, MessageScroller, MessageScrollerViewport, MessageScrollerContent, MessageScrollerItem, MessageScrollerButton } from "@/components/ui/message-scroller";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import Message from "./Message";
import type { ChatStatus, UIMessage } from "ai";

export default function MessageList({ messages, status }: { messages: UIMessage[]; status: ChatStatus }) {
  if (messages.length === 0) {
    return (
      <Empty className="flex-1 border-none">
        <EmptyHeader>
          <EmptyTitle
            className="italic"
            style={{
              color: "var(--text-secondary)",
              fontFamily: "var(--font-display), 'Fraunces', serif",
              fontSize: 28,
              fontWeight: 400,
              letterSpacing: "-0.015em",
              lineHeight: 1.15,
            }}
          >
            on commence <br />par quoi ?
          </EmptyTitle>
          <EmptyDescription
            className="text-[11px] mt-1"
            style={{
              color: "var(--text-muted)",
              fontFamily: "var(--font-mono), 'JetBrains Mono', monospace",
              letterSpacing: "0.18em",
              textTransform: "uppercase",
            }}
          >
            Texte · Image · Vocal
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <MessageScrollerProvider>
      <MessageScroller className="flex-1" style={{ borderTop: "1px solid var(--line-faint)" }}>
        <MessageScrollerViewport>
          <MessageScrollerContent>
            {messages.map((m) => (
              <MessageScrollerItem key={m.id} scrollAnchor={m.role === "user"}>
                <Message message={m} status={status} />
              </MessageScrollerItem>
            ))}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton />
      </MessageScroller>
    </MessageScrollerProvider>
  );
}
