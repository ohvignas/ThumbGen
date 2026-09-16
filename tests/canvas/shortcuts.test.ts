import { describe, it, expect } from "vitest";
import { OVERLAY_SELECTOR, hasOpenOverlay, isEditableTarget, matchCanvasShortcut } from "@/lib/canvas/shortcuts";

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
  it("looks for dialogs, menus and the Excalidraw editor", () => {
    expect(OVERLAY_SELECTOR).toContain('[role="dialog"]');
    expect(OVERLAY_SELECTOR).toContain('[role="menu"]');
    expect(OVERLAY_SELECTOR).toContain(".excalidraw");
    expect(hasOpenOverlay({ querySelector: () => ({}) as Element })).toBe(true);
    expect(hasOpenOverlay({ querySelector: () => null })).toBe(false);
  });
});
