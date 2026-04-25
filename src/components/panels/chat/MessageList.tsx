"use client";
import { useEffect, useRef } from "react";
import Message, { DisplayMessage } from "./Message";

export default function MessageList({ messages }: { messages: DisplayMessage[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.scrollTo({ top: ref.current.scrollHeight, behavior: "smooth" });
    }
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-center px-8">
        <div>
          <p
            className="italic mb-2"
            style={{
              color: "var(--text-secondary)",
              fontFamily: "var(--font-display), 'Fraunces', serif",
              fontSize: 28,
              letterSpacing: "-0.015em",
              lineHeight: 1.15,
            }}
          >
            qu&apos;est-ce <br />qu&apos;on construit ?
          </p>
          <p
            className="text-[11px] mt-3"
            style={{
              color: "var(--text-muted)",
              fontFamily: "var(--font-mono), 'JetBrains Mono', monospace",
              letterSpacing: "0.18em",
              textTransform: "uppercase",
            }}
          >
            Texte · Image · Vocal
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className="flex-1 overflow-y-auto"
      style={{ borderTop: "1px solid var(--line-faint)" }}
    >
      {messages.map((m, i) => (
        <div
          key={m.id}
          style={{ borderBottom: i === messages.length - 1 ? "none" : "1px solid var(--line-faint)" }}
        >
          <Message msg={m} />
        </div>
      ))}
    </div>
  );
}
