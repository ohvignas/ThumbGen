"use client";

import { useEffect } from "react";
import { useCanvasStore } from "@/store/canvas-store";
import { hasOpenOverlay, isEditableTarget, matchCanvasShortcut } from "@/lib/canvas/shortcuts";

/**
 * N → step picker (view centre) · ⇧⌥T → ranger · ⌘A → tout sélectionner ·
 * ⌘D → dupliquer la sélection · Échap → ferme le panneau, sinon désélectionne.
 * Ignored while typing, and (except Échap closing the picker) while a dialog,
 * menu, the picker or the sketch editor is open.
 */
export function useCanvasShortcuts({ onAutoLayout }: { onAutoLayout: () => void }) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const shortcut = matchCanvasShortcut(event);
      if (!shortcut) return;
      const store = useCanvasStore.getState();

      if (shortcut === "escape") {
        if (store.nodePicker) {
          store.closeNodePicker();
          return;
        }
        if (isEditableTarget(event.target) || hasOpenOverlay(document)) return;
        store.setAllSelected(false);
        return;
      }

      if (event.repeat || store.nodePicker || isEditableTarget(event.target) || hasOpenOverlay(document)) return;

      switch (shortcut) {
        case "add-step":
          event.preventDefault();
          store.openNodePicker({ mode: "free" });
          return;
        case "auto-layout":
          event.preventDefault();
          if (store.nodes.length > 0) onAutoLayout();
          return;
        case "select-all":
          event.preventDefault();
          store.setAllSelected(true);
          return;
        case "duplicate":
          event.preventDefault();
          for (const node of store.nodes.filter((candidate) => candidate.selected)) {
            store.duplicateNode(node.id);
          }
          return;
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onAutoLayout]);
}
