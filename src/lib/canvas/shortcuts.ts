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

/**
 * Open dialogs/sheets, menus and listboxes (Base UI) and the full-screen
 * sketch editor. Covers an open Base UI `Select` (e.g. the Personnage
 * picker) — it doesn't stop keydown from reaching the canvas, so without
 * this a shortcut key typed while it's open (like the picker's « n ») would
 * still fire.
 *
 * The listbox part is scoped to `[data-open] [role="listbox"]`, not a bare
 * `[role="listbox"]`: Base UI keeps a Select's listbox mounted in the DOM
 * (0×0, inert) after it closes instead of removing it — only its `[data-open]`
 * wrapper flips to `data-closed`. A bare role selector would therefore stay
 * "open" forever after the first time any Select is opened in the session,
 * silently disabling every shortcut but Escape from then on.
 */
export const OVERLAY_SELECTOR =
  '[role="dialog"], [role="alertdialog"], [role="menu"], [data-open] [role="listbox"], .excalidraw';

export function hasOpenOverlay(doc: { querySelector(selectors: string): Element | null }): boolean {
  return doc.querySelector(OVERLAY_SELECTOR) !== null;
}

export type ShortcutContext = {
  repeat: boolean;
  pickerOpen: boolean;
  editableTarget: boolean;
  overlayOpen: boolean;
};

export type ShortcutAction = "close-picker" | "deselect-all" | "run" | "ignore";

/**
 * Pure decision for what a matched shortcut should do, given the current
 * context. Escape has its own order (close the picker first, even while
 * typing or an overlay is open); every other shortcut is blocked by a key
 * repeat, the picker being open, typing in a field, or an open overlay.
 */
export function resolveShortcutAction(shortcut: CanvasShortcut, context: ShortcutContext): ShortcutAction {
  if (shortcut === "escape") {
    if (context.pickerOpen) return "close-picker";
    if (context.editableTarget || context.overlayOpen) return "ignore";
    return "deselect-all";
  }
  if (context.repeat || context.pickerOpen || context.editableTarget || context.overlayOpen) return "ignore";
  return "run";
}
