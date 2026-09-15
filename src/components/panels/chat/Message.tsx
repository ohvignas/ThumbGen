"use client";
import { Message as MessageRow, MessageContent } from "@/components/ui/message";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Reasoning, ReasoningTrigger, ReasoningContent } from "@/components/ai-elements/reasoning";
import ToolCallCard from "./ToolCallCard";
import { TextMarkdown } from "./TextMarkdown";
import { useChatStore } from "@/store/chat-store";
import type { UIMessage } from "ai";

export default function Message({ message, isStreaming }: { message: UIMessage; isStreaming: boolean }) {
  const openAnnotate = useChatStore((s) => s.openAnnotate);
  const isUser = message.role === "user";

  if (isUser) {
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

  return (
    <MessageRow align="start">
      <MessageContent>
        {message.parts.map((part, i) => {
          if (part.type === "text") return <TextMarkdown key={i} text={part.text} openAnnotate={openAnnotate} />;
          if (part.type.startsWith("tool-")) {
            return <ToolCallCard key={i} part={part as Extract<UIMessage["parts"][number], { type: `tool-${string}` }>} />;
          }
          if (part.type === "reasoning") {
            return (
              <Reasoning key={i} isStreaming={isStreaming}>
                <ReasoningTrigger getThinkingMessage={(streaming, duration) =>
                  streaming ? "réfléchit…" : duration !== undefined ? `a réfléchi ${duration}s` : "a réfléchi"
                } />
                <ReasoningContent>{part.text}</ReasoningContent>
              </Reasoning>
            );
          }
          return null;
        })}
      </MessageContent>
    </MessageRow>
  );
}
