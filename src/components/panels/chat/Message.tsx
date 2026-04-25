"use client";
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
 * thin magenta hairline on the right edge — only place the brand color appears
 * in the message stream, used as a quiet "yours" marker.
 */
export default function Message({ msg }: { msg: DisplayMessage }) {
  const isUser = msg.role === "user";
  return (
    <div
      className="px-4 py-3"
      style={
        isUser
          ? { borderRight: "1px solid var(--brand-tint)" }
          : undefined
      }
    >
      <div
        className="text-[9px] uppercase mb-1.5 select-none"
        style={{
          color: "var(--text-muted)",
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
              <p
                key={i}
                className="text-sm whitespace-pre-wrap break-words"
                style={{ color: "var(--text-primary)", lineHeight: 1.55 }}
              >
                {b.text}
              </p>
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
