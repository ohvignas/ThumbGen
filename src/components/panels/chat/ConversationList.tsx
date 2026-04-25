"use client";
import { useEffect, useState, useCallback } from "react";
import { useChatStore } from "@/store/chat-store";

type Conv = { id: string; title: string; updated_at: string };

export default function ConversationList({ projectId }: { projectId: string }) {
  const [convs, setConvs] = useState<Conv[]>([]);
  const [loading, setLoading] = useState(false);
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const setActive = useChatStore((s) => s.setActive);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/agent/conversations?project_id=${encodeURIComponent(projectId)}`);
      const list = (await res.json()) as Conv[];
      setConvs(list);
      if (!activeConversationId && list.length > 0) {
        setActive(list[0].id);
      }
    } catch {
      setConvs([]);
    } finally {
      setLoading(false);
    }
  }, [projectId, activeConversationId, setActive]);

  useEffect(() => {
    reload();
    // We intentionally only depend on projectId here — `reload` includes
    // activeConversationId in its closure but we only want the initial load
    // to set active when there's no current one. After that, switching active
    // is the user's job.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const create = useCallback(async () => {
    const res = await fetch("/api/agent/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: projectId }),
    });
    if (!res.ok) return;
    const conv = (await res.json()) as Conv;
    setConvs((prev) => [conv, ...prev]);
    setActive(conv.id);
  }, [projectId, setActive]);

  const remove = useCallback(
    async (id: string) => {
      if (!confirm("Supprimer cette conversation ?")) return;
      const res = await fetch(`/api/agent/conversations/${id}`, { method: "DELETE" });
      if (!res.ok) return;
      setConvs((prev) => prev.filter((c) => c.id !== id));
      if (activeConversationId === id) {
        setActive(null);
      }
    },
    [activeConversationId, setActive],
  );

  return (
    <div className="border-b">
      <details open className="px-2 py-2">
        <summary className="text-xs text-gray-600 cursor-pointer flex items-center gap-1.5 select-none">
          <span>Conversations ({convs.length})</span>
          {loading && <span className="text-gray-400 animate-pulse">…</span>}
        </summary>

        <div className="space-y-0.5 mt-2">
          <button
            onClick={create}
            className="w-full text-left px-2 py-1.5 text-xs text-blue-600 hover:bg-blue-50 rounded font-medium"
          >
            + Nouvelle conversation
          </button>

          {convs.length === 0 && !loading && (
            <p className="text-xs text-gray-400 px-2 py-1.5 italic">Aucune conversation.</p>
          )}

          {convs.map((c) => {
            const isActive = activeConversationId === c.id;
            return (
              <div
                key={c.id}
                className={`group flex items-center justify-between gap-1 px-2 py-1.5 rounded text-xs ${
                  isActive ? "bg-blue-100 text-blue-900" : "hover:bg-gray-100 text-gray-700"
                }`}
              >
                <button
                  onClick={() => setActive(c.id)}
                  className="flex-1 text-left truncate"
                  title={c.title}
                >
                  {c.title}
                </button>
                <button
                  onClick={() => remove(c.id)}
                  className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-600 px-1"
                  aria-label="Supprimer"
                  title="Supprimer"
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      </details>
    </div>
  );
}
