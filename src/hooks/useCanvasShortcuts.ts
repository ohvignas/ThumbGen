"use client";

import { useEffect } from "react";
import { useCanvasStore } from "@/store/canvas-store";
import { hasOpenOverlay, isEditableTarget, matchCanvasShortcut, resolveShortcutAction } from "@/lib/canvas/shortcuts";

/**
 * N → step picker (view centre) · ⇧⌥T → ranger · ⌘A → tout sélectionner ·
 * ⌘D → dupliquer la sélection · ⌫/Delete → supprimer la sélection ·
 * Échap → ferme le panneau, sinon désélectionne.
 * Ignored while typing, and (except Échap closing the picker) while a dialog,
 * menu, the picker or the sketch editor is open.
 */
export function useCanvasShortcuts({ onAutoLayout }: { onAutoLayout: () => void }) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const shortcut = matchCanvasShortcut(event);
      if (!shortcut) return;
      const store = useCanvasStore.getState();

      const action = resolveShortcutAction(shortcut, {
        repeat: event.repeat,
        pickerOpen: store.nodePicker !== null,
        editableTarget: isEditableTarget(event.target),
        overlayOpen: hasOpenOverlay(document),
      });

      switch (action) {
        case "close-picker":
          store.closeNodePicker();
          return;
        case "deselect-all":
          store.setAllSelected(false);
          return;
        case "ignore":
          return;
        case "run":
          break;
      }

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
        case "duplicate": {
          event.preventDefault();
          const newIds = store.nodes
            .filter((candidate) => candidate.selected)
            .map((node) => store.duplicateNode(node.id))
            .filter((id) => id !== "");
          if (newIds.length > 0) store.selectOnly(newIds);
          return;
        }
        case "delete":
          event.preventDefault();
          store.deleteSelected();
          return;
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onAutoLayout]);
}
