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

export default function Message({ msg }: { msg: DisplayMessage }) {
  const isUser = msg.role === "user";
  return (
    <div className={`px-3 py-2 ${isUser ? "bg-blue-50/50" : ""}`}>
      <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-1 font-medium">
        {isUser ? "Toi" : "Claude"}
      </div>
      <div className="space-y-1">
        {msg.blocks.map((b, i) => {
          if (b.type === "text") {
            return (
              <p key={i} className="text-sm whitespace-pre-wrap break-words text-gray-800">
                {b.text}
              </p>
            );
          }
          if (b.type === "image") {
            return (
              <img
                key={i}
                src={b.preview_url}
                alt={b.alt ?? "image"}
                className="max-w-xs rounded border my-1"
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
