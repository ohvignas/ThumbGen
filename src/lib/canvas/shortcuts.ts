export type CanvasShortcut = "add-step" | "auto-layout" | "select-all" | "duplicate" | "escape";

type KeyInput = Pick<KeyboardEvent, "key" | "code" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey">;

/**
 * Canvas keyboard shortcuts. Letters match `event.key` (layout-aware: the A
 * key of an AZERTY keyboard is still « a »). ⇧⌥T matches `event.code`
 * because Option rewrites `event.key` on macOS (⇧⌥T → « ˇ »).
 * ⌘Z / ⇧⌘Z (ZoomBar) and Backspace/Delete (React Flow) are handled elsewhere.
 */
export function matchCanvasShortcut(event: KeyInput): CanvasShortcut | null {
  const mod = event.metaKey || event.ctrlKey;
  const key = event.key.toLowerCase();
  if (event.key === "Escape") return !mod && !event.shiftKey && !event.altKey ? "escape" : null;
  if (!mod && !event.shiftKey && !event.altKey && key === "n") return "add-step";
  if (!mod && event.shiftKey && event.altKey && event.code === "KeyT") return "auto-layout";
  if (mod && !event.shiftKey && !event.altKey && key === "a") return "select-all";
  if (mod && !event.shiftKey && !event.altKey && key === "d") return "duplicate";
  return null;
}

/** Typing in a field must never trigger a canvas shortcut. */
export function isEditableTarget(target: EventTarget | null): boolean {
  const element = target as { tagName?: unknown; isContentEditable?: unknown } | null;
  if (!element || typeof element.tagName !== "string") return false;
  const tag = element.tagName.toUpperCase();
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || element.isContentEditable === true;
}

/** Open dialogs/sheets and menus (Base UI) and the full-screen sketch editor. */
export const OVERLAY_SELECTOR = '[role="dialog"], [role="alertdialog"], [role="menu"], .excalidraw';

export function hasOpenOverlay(doc: { querySelector(selectors: string): Element | null }): boolean {
  return doc.querySelector(OVERLAY_SELECTOR) !== null;
}
