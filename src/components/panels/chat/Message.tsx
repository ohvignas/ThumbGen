"use client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Message as MessageRow, MessageContent } from "@/components/ui/message";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Reasoning, ReasoningTrigger, ReasoningContent } from "@/components/ai-elements/reasoning";
import ToolCallCard from "./ToolCallCard";
import { useChatStore } from "@/store/chat-store";
import type { ChatStatus, UIMessage } from "ai";

function TextMarkdown({ text, openAnnotate }: { text: string; openAnnotate: (url: string) => void }) {
  return (
    <div className="text-sm break-words chat-md" style={{ color: "var(--text-primary)", lineHeight: 1.55 }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: "var(--brand)", textDecoration: "underline", textUnderlineOffset: 2 }}>
              {children}
            </a>
          ),
          code: ({ children, ...props }) => {
            const isInline = !(props as { node?: { position?: { start: { line: number }; end: { line: number } } } }).node?.position
              || (props as { node: { position: { start: { line: number }; end: { line: number } } } }).node.position.start.line
              === (props as { node: { position: { start: { line: number }; end: { line: number } } } }).node.position.end.line;
            return (
              <code style={{
                background: "var(--ink-3)", padding: isInline ? "1px 5px" : "10px 12px",
                borderRadius: isInline ? 4 : 8, fontFamily: "var(--font-mono), 'JetBrains Mono', monospace",
                fontSize: isInline ? 12 : 11, display: isInline ? "inline" : "block",
                border: "1px solid var(--line-faint)", color: "var(--text-secondary)", overflowX: isInline ? "visible" : "auto",
              }}>
                {children}
              </code>
            );
          },
          img: ({ src, alt }) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={typeof src === "string" ? src : ""} alt={alt ?? ""} onClick={() => typeof src === "string" && openAnnotate(src)}
              loading="lazy" style={{ maxWidth: "100%", borderRadius: 8, margin: "8px 0", cursor: "zoom-in", border: "1px solid var(--line-faint)" }} />
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

export default function Message({ message, status }: { message: UIMessage; status: ChatStatus }) {
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
                      className="max-w-[240px] rounded my-1" style={{ border: "1px solid var(--line)", cursor: "zoom-in" }} />
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
              <Reasoning key={i} isStreaming={status === "streaming"}>
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
