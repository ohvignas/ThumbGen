"use client";
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Tab = "faces" | "logos" | "refs";
type Item = { source: string; preview_url: string; label: string };

const TABS: Record<Tab, { listUrl: string; imagePrefix: string; storedPrefix: "fr" | "lg" | "sf"; labelKey: "label" | "title" }> = {
  faces: { listUrl: "/api/face-reactions", imagePrefix: "/api/face-reactions/image", storedPrefix: "fr", labelKey: "label" },
  logos: { listUrl: "/api/logos", imagePrefix: "/api/logos/image", storedPrefix: "lg", labelKey: "label" },
  refs: { listUrl: "/api/swipe-files", imagePrefix: "/api/swipe-files/image", storedPrefix: "sf", labelKey: "title" },
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
              preview_url: `${cfg.imagePrefix}?f=${encodeURIComponent(id)}`,
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
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="w-[640px] max-w-[90vw] max-h-[85vh] flex flex-col overflow-hidden p-0">
        <DialogHeader className="px-4 py-3 border-b">
          <DialogTitle>Bibliothèque</DialogTitle>
        </DialogHeader>

        <div className="flex gap-0 px-4 pt-3 border-b">
          {(Object.keys(TABS) as Tab[]).map((t) => {
            const isActive = tab === t;
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 pb-2 text-[10px] uppercase tracking-wider transition-colors relative ${isActive ? "text-foreground" : "text-muted-foreground"}`}
              >
                {TAB_LABELS[t]}
                {isActive && <span className="absolute left-3 right-3 -bottom-px h-px bg-primary" />}
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <p className="text-center py-12 text-muted-foreground text-sm">Chargement…</p>
          ) : items.length === 0 ? (
            <p className="text-center py-12 text-muted-foreground text-sm">Aucun élément.</p>
          ) : (
            <div className="grid grid-cols-4 gap-3">
              {items.map((it) => (
                <button
                  key={it.source}
                  onClick={() => onPick(it.source, it.preview_url)}
                  className="rounded overflow-hidden text-left transition-all border border-border hover:border-muted-foreground"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={it.preview_url} alt={it.label} className="w-full h-24 object-cover bg-muted" />
                  <div className="text-[11px] px-2 py-1.5 truncate text-foreground">{it.label}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
