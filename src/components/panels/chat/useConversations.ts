"use client";
import { useCallback, useEffect, useState } from "react";
import { useChatStore } from "@/store/chat-store";
import { useAgentRuns } from "@/components/agent-runs/AgentRunsProvider";
import { pickConversationId } from "@/components/agent-runs/agent-runs-model";

export type Conversation = { id: string; title: string; updated_at: string };

/**
 * The project's conversations plus create/remove. When nothing is active it
 * selects, from a fresh runs snapshot, the conversation where the agent works,
 * else the one with an ending not seen before opening, else the most recent one. Refetches whenever the chat
 * store's list version is bumped (e.g. after a send, when an auto title lands).
 */
export function useConversations(projectId: string) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(false);
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const setActive = useChatStore((s) => s.setActive);
  const conversationListVersion = useChatStore((s) => s.conversationListVersion);
  const { refreshRuns, unseenOnArrival } = useAgentRuns();

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/agent/conversations?project_id=${encodeURIComponent(projectId)}`);
      const list = (await res.json()) as Conversation[];
      setConversations(list);
      if (!useChatStore.getState().activeConversationId && list.length > 0) {
        const runs = await refreshRuns();
        if (!useChatStore.getState().activeConversationId) setActive(pickConversationId(list, runs, unseenOnArrival(), projectId));
      }
    } catch {
      setConversations([]);
    } finally {
      setLoading(false);
    }
  }, [projectId, setActive, refreshRuns, unseenOnArrival]);

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
      // The server also stops a turn still running in this conversation.
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
