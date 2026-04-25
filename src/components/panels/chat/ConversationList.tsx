"use client";
import { useEffect, useState, useCallback } from "react";
import { useChatStore } from "@/store/chat-store";

type Conv = { id: string; title: string; updated_at: string };

export default function ConversationList({ projectId }: { projectId: string }) {
  const [convs, setConvs] = useState<Conv[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
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
    <div
      className="px-3 py-2.5 relative"
      style={{ borderBottom: "1px solid var(--line-faint)" }}
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-2 text-left transition-colors nopan nodrag"
        style={{ color: "var(--text-secondary)" }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="text-[9px] uppercase shrink-0"
            style={{
              color: "var(--text-muted)",
              fontFamily: "var(--font-mono), 'JetBrains Mono', monospace",
              letterSpacing: "0.22em",
            }}
          >
            <span style={{ color: "var(--brand)" }}>{count}</span> Conv.
          </span>
          <span
            className="italic truncate"
            style={{
              color: active ? "var(--text-primary)" : "var(--text-muted)",
              fontFamily: "var(--font-display), 'Fraunces', serif",
              fontSize: 14,
              letterSpacing: "-0.01em",
            }}
          >
            {active?.title ?? "—"}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {loading && (
            <span className="text-[10px] animate-pulse" style={{ color: "var(--text-muted)" }}>
              …
            </span>
          )}
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            style={{
              color: "var(--text-tertiary)",
              transform: open ? "rotate(180deg)" : "rotate(0)",
              transition: "transform 0.18s ease",
            }}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </button>

      {open && (
        <div
          className="absolute left-0 right-0 top-full mt-1 mx-2 rounded-xl overflow-hidden z-30 shadow-2xl"
          style={{
            background: "var(--node-bg)",
            border: "1px solid var(--line-strong)",
          }}
        >
          <button
            onClick={create}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-xs transition-colors"
            style={{
              color: "var(--text-secondary)",
              borderBottom: "1px solid var(--line-faint)",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.03)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            <span style={{ fontFamily: "var(--font-mono), monospace", letterSpacing: "0.18em", textTransform: "uppercase", fontSize: 10 }}>
              Nouvelle
            </span>
          </button>

          <div className="max-h-64 overflow-y-auto py-1">
            {convs.length === 0 && !loading && (
              <p className="text-[11px] italic px-3 py-2" style={{ color: "var(--text-muted)" }}>
                Aucune conversation.
              </p>
            )}

            {convs.map((c) => {
              const isActive = activeConversationId === c.id;
              return (
                <div
                  key={c.id}
                  className="group flex items-center gap-2 px-3 py-2 transition-colors cursor-pointer"
                  onClick={() => {
                    setActive(c.id);
                    setOpen(false);
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) e.currentTarget.style.background = "rgba(255,255,255,0.03)";
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) e.currentTarget.style.background = "transparent";
                  }}
                  style={{
                    background: isActive ? "var(--surface)" : "transparent",
                  }}
                >
                  {isActive ? (
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ background: "var(--brand)" }}
                    />
                  ) : (
                    <span className="w-1.5 h-1.5 shrink-0" />
                  )}
                  <span
                    className="flex-1 truncate text-xs italic"
                    style={{
                      color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
                      fontFamily: "var(--font-display), 'Fraunces', serif",
                      fontSize: 13,
                    }}
                    title={c.title}
                  >
                    {c.title}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      remove(c.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5"
                    style={{ color: "var(--ember)" }}
                    aria-label="Supprimer"
                    title="Supprimer"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
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
