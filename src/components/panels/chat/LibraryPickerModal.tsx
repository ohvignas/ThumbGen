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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl p-4 w-[640px] max-w-[90vw] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-semibold">Bibliothèque</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800" aria-label="Fermer">×</button>
        </div>

        <div className="flex gap-2 mb-3 border-b">
          {(Object.keys(TABS) as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 text-sm border-b-2 -mb-px ${
                tab === t ? "border-blue-500 text-blue-600 font-medium" : "border-transparent text-gray-600"
              }`}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-sm text-gray-500 py-8 text-center">Chargement…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-gray-500 py-8 text-center">Aucun élément.</p>
        ) : (
          <div className="grid grid-cols-4 gap-2 max-h-96 overflow-y-auto">
            {items.map((it) => (
              <button
                key={it.source}
                onClick={() => onPick(it.source, it.preview_url)}
                className="rounded-lg overflow-hidden border hover:border-blue-400 transition group"
              >
                <img
                  src={it.preview_url}
                  alt={it.label}
                  className="w-full h-24 object-cover bg-gray-100"
                />
                <div className="text-xs p-1.5 truncate text-left">{it.label}</div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
