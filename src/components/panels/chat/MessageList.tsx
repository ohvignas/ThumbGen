"use client";
import { useEffect, useRef } from "react";
import Message, { DisplayMessage } from "./Message";

export default function MessageList({ messages }: { messages: DisplayMessage[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Scroll to bottom when messages change
    if (ref.current) {
      ref.current.scrollTo({ top: ref.current.scrollHeight, behavior: "smooth" });
    }
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-center px-6">
        <div className="text-gray-400">
          <div className="text-4xl mb-2">✨</div>
          <p className="text-sm">Décris ta miniature pour démarrer.</p>
          <p className="text-xs mt-1">Tu peux envoyer du texte, des images ou un message vocal.</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={ref} className="flex-1 overflow-y-auto divide-y">
      {messages.map((m) => (
        <Message key={m.id} msg={m} />
      ))}
    </div>
  );
}
