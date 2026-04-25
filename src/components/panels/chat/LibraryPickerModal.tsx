"use client";
import { useEffect, useState } from "react";

type Tab = "faces" | "logos" | "refs";
type Item = { source: string; preview_url: string; label: string };

const TABS: Record<Tab, { listUrl: string; imagePrefix: string; storedPrefix: "fr" | "lg" | "sf"; labelKey: "label" | "title" }> = {
  faces: { listUrl: "/api/face-reactions", imagePrefix: "/api/face-reactions/image", storedPrefix: "fr", labelKey: "label" },
  logos: { listUrl: "/api/logos", imagePrefix: "/api/logos/image", storedPrefix: "lg", labelKey: "label" },
  refs:  { listUrl: "/api/swipe-files", imagePrefix: "/api/swipe-files/image", storedPrefix: "sf", labelKey: "title" },
};

const TAB_LABELS: Record<Tab, string> = { faces: "Visages", logos: "Logos", refs: "Références" };

export default function LibraryPickerModal({
  onClose,
  onPick,
}: {
  onClose: () => void;
  onPick: (source: string, preview_url: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("faces");
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); // eslint-disable-line react-hooks/set-state-in-effect
    const cfg = TABS[tab];
    fetch(cfg.listUrl)
      .then((r) => r.json())
      .then((rows: Array<Record<string, unknown>>) => {
        if (cancelled) return;
        setItems(
          rows.map((r) => {
            const id = r.filename as string;
            const label = (r[cfg.labelKey] as string) || "Untitled";
            return {
              source: `stored:${cfg.storedPrefix}_${id}`,
              preview_url: `${cfg.imagePrefix}/${id}`,
              label,
            };
          }),
        );
      })
      .catch(() => setItems([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [tab]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(8, 8, 12, 0.7)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="rounded-xl w-[640px] max-w-[90vw] max-h-[85vh] flex flex-col overflow-hidden"
        style={{
          background: "var(--node-bg)",
          border: "1px solid var(--line-strong)",
          boxShadow: "0 24px 48px rgba(0,0,0,0.5)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex justify-between items-center px-4 py-3"
          style={{ borderBottom: "1px solid var(--line-faint)" }}
        >
          <div className="flex items-baseline gap-2">
            <span
              className="text-[9px] uppercase"
              style={{
                color: "var(--text-muted)",
                fontFamily: "var(--font-mono), 'JetBrains Mono', monospace",
                letterSpacing: "0.22em",
              }}
            >
              <span style={{ color: "var(--brand)" }}>—</span> Source
            </span>
            <h3
              className="italic"
              style={{
                color: "var(--text-primary)",
                fontFamily: "var(--font-display), 'Fraunces', serif",
                fontSize: 18,
                letterSpacing: "-0.015em",
              }}
            >
              Bibliothèque
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded transition-colors"
            style={{ color: "var(--text-tertiary)" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-primary)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-tertiary)")}
            aria-label="Fermer"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div
          className="flex gap-0 px-4 pt-3"
          style={{ borderBottom: "1px solid var(--line-faint)" }}
        >
          {(Object.keys(TABS) as Tab[]).map((t) => {
            const isActive = tab === t;
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="px-3 pb-2 text-xs transition-colors relative"
                style={{
                  color: isActive ? "var(--text-primary)" : "var(--text-tertiary)",
                  fontFamily: "var(--font-mono), 'JetBrains Mono', monospace",
                  textTransform: "uppercase",
                  letterSpacing: "0.18em",
                  fontSize: 10,
                }}
              >
                {TAB_LABELS[t]}
                {isActive && (
                  <span
                    className="absolute left-3 right-3 -bottom-px h-px"
                    style={{ background: "var(--brand)" }}
                  />
                )}
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <p
              className="text-center py-12 italic"
              style={{
                color: "var(--text-muted)",
                fontFamily: "var(--font-display), 'Fraunces', serif",
                fontSize: 16,
              }}
            >
              chargement…
            </p>
          ) : items.length === 0 ? (
            <p
              className="text-center py-12 italic"
              style={{
                color: "var(--text-muted)",
                fontFamily: "var(--font-display), 'Fraunces', serif",
                fontSize: 16,
              }}
            >
              aucun élément.
            </p>
          ) : (
            <div className="grid grid-cols-4 gap-3">
              {items.map((it) => (
                <button
                  key={it.source}
                  onClick={() => onPick(it.source, it.preview_url)}
                  className="rounded overflow-hidden text-left transition-all"
                  style={{ border: "1px solid var(--line)" }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "var(--bone-muted)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "var(--line)";
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={it.preview_url}
                    alt={it.label}
                    className="w-full h-24 object-cover"
                    style={{ background: "var(--ink-3)" }}
                  />
                  <div
                    className="text-[11px] px-2 py-1.5 truncate"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {it.label}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
