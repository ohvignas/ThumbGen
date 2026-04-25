"use client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import ToolCallCard from "./ToolCallCard";

export type MessageBlock =
  | { type: "text"; text: string }
  | { type: "image"; preview_url: string; alt?: string }
  | {
      type: "tool_call";
      id: string;
      name: string;
      input?: unknown;
      status: "pending" | "done" | "error";
      summary?: string;
    };

export type DisplayMessage = {
  id: string;
  role: "user" | "assistant";
  blocks: MessageBlock[];
};

/**
 * Atelier Nocturne message.
 * No bubbles. Mono eyebrow (TOI · CLAUDE), DM Sans body. User messages get a
 * soft magenta-tinted background + magenta eyebrow + brand left edge — makes
 * "yours" scannable at a glance without violating the brand-rare rule (the
 * tint is ~14% opacity magenta, no full magenta surface).
 */
export default function Message({ msg }: { msg: DisplayMessage }) {
  const isUser = msg.role === "user";
  return (
    <div
      className="px-4 py-3"
      style={
        isUser
          ? {
              background: "var(--brand-tint)",
              borderLeft: "2px solid var(--brand)",
            }
          : undefined
      }
    >
      <div
        className="text-[9px] uppercase mb-1.5 select-none"
        style={{
          color: isUser ? "var(--brand)" : "var(--text-muted)",
          fontFamily: "var(--font-mono), 'JetBrains Mono', monospace",
          letterSpacing: "0.22em",
        }}
      >
        {isUser ? "Toi" : "Claude"}
      </div>
      <div className="space-y-1.5">
        {msg.blocks.map((b, i) => {
          if (b.type === "text") {
            return (
              <div
                key={i}
                className="text-sm break-words chat-md"
                style={{ color: "var(--text-primary)", lineHeight: 1.55 }}
              >
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    a: ({ href, children }) => (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: "var(--brand)", textDecoration: "underline", textUnderlineOffset: 2 }}
                      >
                        {children}
                      </a>
                    ),
                    code: ({ children, ...props }) => {
                      const isInline = !(props as { node?: { position?: { start: { line: number }; end: { line: number } } } }).node?.position
                        || (props as { node: { position: { start: { line: number }; end: { line: number } } } }).node.position.start.line
                        === (props as { node: { position: { start: { line: number }; end: { line: number } } } }).node.position.end.line;
                      return (
                        <code
                          style={{
                            background: "var(--ink-3)",
                            padding: isInline ? "1px 5px" : "10px 12px",
                            borderRadius: isInline ? 4 : 8,
                            fontFamily: "var(--font-mono), 'JetBrains Mono', monospace",
                            fontSize: isInline ? 12 : 11,
                            display: isInline ? "inline" : "block",
                            border: "1px solid var(--line-faint)",
                            color: "var(--text-secondary)",
                            overflowX: isInline ? "visible" : "auto",
                          }}
                        >
                          {children}
                        </code>
                      );
                    },
                  }}
                >
                  {b.text}
                </ReactMarkdown>
              </div>
            );
          }
          if (b.type === "image") {
            return (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={b.preview_url}
                alt={b.alt ?? "image"}
                className="max-w-[240px] rounded my-1"
                style={{ border: "1px solid var(--line)" }}
              />
            );
          }
          if (b.type === "tool_call") {
            return (
              <ToolCallCard
                key={i}
                name={b.name}
                status={b.status}
                summary={b.summary}
                input={b.input}
              />
            );
          }
          return null;
        })}
      </div>
    </div>
  );
}
