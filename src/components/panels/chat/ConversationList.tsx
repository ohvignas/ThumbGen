"use client";
import { useEffect, useState, useCallback } from "react";
import { useChatStore } from "@/store/chat-store";
import { ChevronDown, Plus, X } from "lucide-react";

type Conv = { id: string; title: string; updated_at: string };

export default function ConversationList({ projectId }: { projectId: string }) {
  const [convs, setConvs] = useState<Conv[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const setActive = useChatStore((s) => s.setActive);
  const conversationListVersion = useChatStore((s) => s.conversationListVersion);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, conversationListVersion]);

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
    setOpen(false);
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

  const active = convs.find((c) => c.id === activeConversationId);
  const count = String(convs.length).padStart(2, "0");

  return (
    <div className="px-3 py-2.5 relative border-b border-border">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between gap-2 text-left transition-colors nopan nodrag text-foreground">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[9px] uppercase tracking-[0.22em] shrink-0 font-mono text-muted-foreground">
            <span className="text-primary">{count}</span> Conv.
          </span>
          <span className={`italic truncate text-sm tracking-[-0.01em] ${active ? "text-foreground" : "text-muted-foreground"}`}>
            {active?.title ?? "—"}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {loading && <span className="text-[10px] animate-pulse text-muted-foreground">…</span>}
          <ChevronDown className={`size-2.5 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
        </div>
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 mx-2 rounded-xl overflow-hidden z-30 shadow-2xl bg-card border border-border">
          <button
            onClick={create}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-xs transition-colors border-b border-border text-muted-foreground hover:bg-muted"
          >
            <Plus className="size-2.5" />
            <span className="font-mono tracking-[0.18em] uppercase text-[10px]">Nouvelle</span>
          </button>

          <div className="max-h-64 overflow-y-auto py-1">
            {convs.length === 0 && !loading && <p className="text-[11px] italic px-3 py-2 text-muted-foreground">Aucune conversation.</p>}

            {convs.map((c) => {
              const isActive = activeConversationId === c.id;
              return (
                <div
                  key={c.id}
                  className={`group flex items-center gap-2 px-3 py-2 transition-colors cursor-pointer ${isActive ? "bg-muted" : "hover:bg-muted/50"}`}
                  onClick={() => { setActive(c.id); setOpen(false); }}
                >
                  {isActive ? <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-primary" /> : <span className="w-1.5 h-1.5 shrink-0" />}
                  <span className={`flex-1 truncate text-xs italic ${isActive ? "text-foreground" : "text-muted-foreground"}`} title={c.title}>
                    {c.title}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); remove(c.id); }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 text-destructive"
                    aria-label="Supprimer"
                    title="Supprimer"
                  >
                    <X className="size-2.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
