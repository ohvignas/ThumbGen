"use client";

import { Plus } from "lucide-react";
import { useCanvasStore } from "@/store/canvas-store";

/**
 * Centred invitation shown while the loaded project has no node. The overlay
 * lets pan/zoom through (pointer-events-none); only the button is clickable.
 */
export default function CanvasEmptyState() {
  const loaded = useCanvasStore((s) => s.loaded);
  const isEmpty = useCanvasStore((s) => s.nodes.length === 0);
  const openNodePicker = useCanvasStore((s) => s.openNodePicker);

  if (!loaded || !isEmpty) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center">
      <button
        type="button"
        onClick={() => openNodePicker({ mode: "free" })}
        className="group pointer-events-auto flex flex-col items-center gap-3 rounded-2xl p-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span className="flex size-20 items-center justify-center rounded-2xl border-2 border-dashed border-(--line-strong) text-(--text-tertiary) transition-colors group-hover:border-(--canvas-accent) group-hover:text-(--text-primary)">
          <Plus className="size-8" />
        </span>
        <span className="text-sm text-(--text-tertiary) transition-colors group-hover:text-(--text-primary)">
          Ajouter une première étape
        </span>
      </button>
    </div>
  );
}
