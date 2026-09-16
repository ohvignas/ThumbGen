import { describe, it, expect } from "vitest";
import {
  OVERLAY_SELECTOR,
  hasOpenOverlay,
  isEditableTarget,
  matchCanvasShortcut,
  resolveShortcutAction,
} from "@/lib/canvas/shortcuts";

const key = (init: Partial<KeyboardEvent>) =>
  ({ key: "", code: "", metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...init }) as KeyboardEvent;

describe("matchCanvasShortcut", () => {
  it("N opens the picker, without modifiers only", () => {
    expect(matchCanvasShortcut(key({ key: "n", code: "KeyN" }))).toBe("add-step");
    expect(matchCanvasShortcut(key({ key: "N", code: "KeyN" }))).toBe("add-step");
    expect(matchCanvasShortcut(key({ key: "N", code: "KeyN", shiftKey: true }))).toBeNull();
    expect(matchCanvasShortcut(key({ key: "n", code: "KeyN", metaKey: true }))).toBeNull();
  });

  it("⇧⌥T lays out, even though macOS Option rewrites event.key", () => {
    expect(matchCanvasShortcut(key({ key: "ˇ", code: "KeyT", shiftKey: true, altKey: true }))).toBe("auto-layout");
    expect(matchCanvasShortcut(key({ key: "T", code: "KeyT", shiftKey: true }))).toBeNull();
  });

  it("⌘A / Ctrl+A select all, ⌘D / Ctrl+D duplicate", () => {
    expect(matchCanvasShortcut(key({ key: "a", code: "KeyQ", metaKey: true }))).toBe("select-all");
    expect(matchCanvasShortcut(key({ key: "a", ctrlKey: true }))).toBe("select-all");
    expect(matchCanvasShortcut(key({ key: "d", metaKey: true }))).toBe("duplicate");
    expect(matchCanvasShortcut(key({ key: "d", ctrlKey: true }))).toBe("duplicate");
    expect(matchCanvasShortcut(key({ key: "a", metaKey: true, shiftKey: true }))).toBeNull();
  });

  it("Escape without modifiers, nothing else", () => {
    expect(matchCanvasShortcut(key({ key: "Escape" }))).toBe("escape");
    expect(matchCanvasShortcut(key({ key: "Escape", metaKey: true }))).toBeNull();
    expect(matchCanvasShortcut(key({ key: "x" }))).toBeNull();
    expect(matchCanvasShortcut(key({ key: "z", metaKey: true }))).toBeNull();
  });
});

describe("isEditableTarget", () => {
  it("is true for form fields and contenteditable, false otherwise", () => {
    expect(isEditableTarget({ tagName: "INPUT" } as unknown as EventTarget)).toBe(true);
    expect(isEditableTarget({ tagName: "textarea" } as unknown as EventTarget)).toBe(true);
    expect(isEditableTarget({ tagName: "SELECT" } as unknown as EventTarget)).toBe(true);
    expect(isEditableTarget({ tagName: "DIV", isContentEditable: true } as unknown as EventTarget)).toBe(true);
    expect(isEditableTarget({ tagName: "DIV", isContentEditable: false } as unknown as EventTarget)).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });
});

describe("hasOpenOverlay", () => {
  // A fake `querySelector` that mimics the real DOM's comma-list semantics:
  // it matches if ANY of the (trimmed) comma-separated parts of the selector
  // it's called with is one of the selectors an element is "present" for.
  function fakeDoc(presentSelectors: string[]) {
    return {
      querySelector(selectors: string): Element | null {
        const parts = selectors.split(",").map((s) => s.trim());
        return parts.some((p) => presentSelectors.includes(p)) ? ({} as Element) : null;
      },
    };
  }

  it("looks for dialogs, menus, the Excalidraw editor and open Base UI listboxes", () => {
    expect(OVERLAY_SELECTOR).toContain('[role="dialog"]');
    expect(OVERLAY_SELECTOR).toContain('[role="alertdialog"]');
    expect(OVERLAY_SELECTOR).toContain('[role="menu"]');
    expect(OVERLAY_SELECTOR).toContain('[role="listbox"]');
    expect(OVERLAY_SELECTOR).toContain(".excalidraw");
  });

  it("detects an open Base UI listbox (e.g. the Personnage Select) as an overlay", () => {
    expect(hasOpenOverlay(fakeDoc(['[data-open] [role="listbox"]']))).toBe(true);
  });

  it("detects a dialog even when no listbox is present", () => {
    expect(hasOpenOverlay(fakeDoc(['[role="dialog"]']))).toBe(true);
  });

  it("returns false when none of the overlay selectors match anything", () => {
    expect(hasOpenOverlay(fakeDoc([]))).toBe(false);
  });

  // Base UI's Select keeps its listbox mounted in the DOM (0x0, inert) after
  // closing instead of removing it — only its `[data-open]` wrapper flips to
  // `data-closed`. A bare `[role="listbox"]` selector would therefore stay
  // "open" forever after the very first time a user opens any Select, which
  // would silently disable every canvas shortcut (except Escape) for the
  // rest of the session. This reproduces that DOM shape and asserts it is
  // NOT treated as an open overlay.
  it("does not treat a closed-but-still-mounted listbox as an open overlay", () => {
    const closedButMountedListboxDoc = {
      querySelector(selectors: string): Element | null {
        const parts = selectors.split(",").map((s) => s.trim());
        // Only the bare, non-scoped selector matches — the real DOM element
        // exists, just not inside a [data-open] ancestor.
        return parts.includes('[role="listbox"]') ? ({} as Element) : null;
      },
    };
    expect(hasOpenOverlay(closedButMountedListboxDoc)).toBe(false);
  });
});

describe("resolveShortcutAction", () => {
  const ctx = (overrides: Partial<Parameters<typeof resolveShortcutAction>[1]> = {}) => ({
    repeat: false,
    pickerOpen: false,
    editableTarget: false,
    overlayOpen: false,
    ...overrides,
  });

  it("Escape closes the picker first, regardless of anything else", () => {
    expect(resolveShortcutAction("escape", ctx({ pickerOpen: true }))).toBe("close-picker");
    expect(resolveShortcutAction("escape", ctx({ pickerOpen: true, editableTarget: true, overlayOpen: true }))).toBe(
      "close-picker",
    );
  });

  it("Escape is ignored while typing or an overlay is open, when the picker is closed", () => {
    expect(resolveShortcutAction("escape", ctx({ editableTarget: true }))).toBe("ignore");
    expect(resolveShortcutAction("escape", ctx({ overlayOpen: true }))).toBe("ignore");
  });

  it("Escape deselects all otherwise", () => {
    expect(resolveShortcutAction("escape", ctx())).toBe("deselect-all");
  });

  it("any other shortcut is ignored on key repeat, picker open, editable target or overlay open", () => {
    expect(resolveShortcutAction("duplicate", ctx({ repeat: true }))).toBe("ignore");
    expect(resolveShortcutAction("duplicate", ctx({ pickerOpen: true }))).toBe("ignore");
    expect(resolveShortcutAction("add-step", ctx({ editableTarget: true }))).toBe("ignore");
    expect(resolveShortcutAction("select-all", ctx({ overlayOpen: true }))).toBe("ignore");
  });

  it("any other shortcut runs when nothing blocks it", () => {
    expect(resolveShortcutAction("add-step", ctx())).toBe("run");
    expect(resolveShortcutAction("auto-layout", ctx())).toBe("run");
    expect(resolveShortcutAction("select-all", ctx())).toBe("run");
    expect(resolveShortcutAction("duplicate", ctx())).toBe("run");
  });
});
