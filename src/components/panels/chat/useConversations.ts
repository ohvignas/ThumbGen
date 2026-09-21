"use client";
import { useCallback, useEffect, useState } from "react";
import { conversationIdForProject, useChatStore } from "@/store/chat-store";
import { useAgentRuns } from "@/components/agent-runs/AgentRunsProvider";
import { nextActiveConversationId } from "@/components/agent-runs/agent-runs-model";

export type Conversation = { id: string; title: string; updated_at: string };

/**
 * The project's conversations plus create/remove. When nothing belonging to
 * this miniature is active it selects, from a fresh runs snapshot, the
 * conversation where the agent works, else the one with an ending not seen
 * before opening, else the most recent one. Refetches whenever the chat
 * store's list version is bumped (e.g. after a send, when an auto title lands).
 */
export function useConversations(projectId: string) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(false);
  const boundProjectId = useChatStore((s) => s.activeProjectId);
  const storedActiveId = useChatStore((s) => s.activeConversationId);
  const activeConversationId = boundProjectId === projectId ? storedActiveId : null;
  const setActive = useChatStore((s) => s.setActive);
  const conversationListVersion = useChatStore((s) => s.conversationListVersion);
  const { refreshRuns, unseenOnArrival } = useAgentRuns();

  useEffect(() => {
    setConversations([]);
    useChatStore.getState().bindProject(projectId);
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const load = async () => {
      try {
        const res = await fetch(`/api/agent/conversations?project_id=${encodeURIComponent(projectId)}`);
        const list = (await res.json()) as Conversation[];
        if (cancelled) return;
        setConversations(list);
        const current = conversationIdForProject(useChatStore.getState(), projectId);
        if (current && list.some((conversation) => conversation.id === current)) return;
        const runs = await refreshRuns();
        if (cancelled) return;
        const next = nextActiveConversationId(list, runs, unseenOnArrival(), projectId, current);
        if (next !== conversationIdForProject(useChatStore.getState(), projectId)) setActive(next, projectId);
      } catch {
        if (!cancelled) setConversations([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [projectId, conversationListVersion, setActive, refreshRuns, unseenOnArrival]);

  const create = useCallback(async () => {
    const res = await fetch("/api/agent/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: projectId }),
    });
    if (!res.ok) return;
    const conversation = (await res.json()) as Conversation;
    setConversations((prev) => [conversation, ...prev]);
    setActive(conversation.id, projectId);
  }, [projectId, setActive]);

  const remove = useCallback(
    async (id: string) => {
      // The server also stops a turn still running in this conversation.
      const res = await fetch(`/api/agent/conversations/${id}`, { method: "DELETE" });
      if (!res.ok) return;
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (conversationIdForProject(useChatStore.getState(), projectId) === id) setActive(null, projectId);
    },
    [projectId, setActive],
  );

  const active = conversations.find((c) => c.id === activeConversationId) ?? null;

  return {
    conversations,
    active,
    activeConversationId,
    loading,
    create,
    remove,
    select: (id: string) => setActive(id, projectId),
  };
}
