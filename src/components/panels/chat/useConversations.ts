"use client";
import { useCallback, useEffect, useState } from "react";
import { useChatStore } from "@/store/chat-store";

export type Conversation = { id: string; title: string; updated_at: string };

/**
 * The project's conversations plus create/remove. Selects the most recent one
 * when nothing is active, and refetches whenever the chat store's list version
 * is bumped (e.g. after a send, which is when an auto-generated title lands).
 */
export function useConversations(projectId: string) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(false);
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const setActive = useChatStore((s) => s.setActive);
  const conversationListVersion = useChatStore((s) => s.conversationListVersion);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/agent/conversations?project_id=${encodeURIComponent(projectId)}`);
      const list = (await res.json()) as Conversation[];
      setConversations(list);
      if (!useChatStore.getState().activeConversationId && list.length > 0) {
        setActive(list[0].id);
      }
    } catch {
      setConversations([]);
    } finally {
      setLoading(false);
    }
  }, [projectId, setActive]);

  useEffect(() => {
    reload();
  }, [reload, conversationListVersion]);

  const create = useCallback(async () => {
    const res = await fetch("/api/agent/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: projectId }),
    });
    if (!res.ok) return;
    const conversation = (await res.json()) as Conversation;
    setConversations((prev) => [conversation, ...prev]);
    setActive(conversation.id);
  }, [projectId, setActive]);

  const remove = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/agent/conversations/${id}`, { method: "DELETE" });
      if (!res.ok) return;
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (useChatStore.getState().activeConversationId === id) setActive(null);
    },
    [setActive],
  );

  const active = conversations.find((c) => c.id === activeConversationId) ?? null;

  return { conversations, active, activeConversationId, loading, create, remove, select: setActive };
}
