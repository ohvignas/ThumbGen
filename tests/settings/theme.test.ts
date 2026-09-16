// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { THEME_SCRIPT, applyTheme, serverThemeClass, sidebarDefaultOpen } from "@/lib/theme";

type MediaStub = { matches: boolean; addEventListener: (type: string, listener: () => void) => void };

function stubPrefersDark(matches: boolean) {
  const listeners: Array<() => void> = [];
  const media: MediaStub = { matches, addEventListener: (_type, listener) => listeners.push(listener) };
  window.matchMedia = vi.fn().mockReturnValue(media) as unknown as typeof window.matchMedia;
  return { media, listeners };
}

const root = () => document.documentElement;

afterEach(() => {
  root().className = "";
  delete root().dataset.theme;
});

describe("server helpers", () => {
  it("renders the dark class only for the dark theme", () => {
    expect(serverThemeClass("dark")).toBe("dark");
    expect(serverThemeClass("light")).toBe("");
    expect(serverThemeClass("system")).toBe("");
  });

  it("opens the sidebar unless its cookie says false", () => {
    expect(sidebarDefaultOpen(undefined)).toBe(true);
    expect(sidebarDefaultOpen("true")).toBe(true);
    expect(sidebarDefaultOpen("false")).toBe(false);
  });
});

describe("applyTheme", () => {
  it("adds or removes the dark class and records the theme", () => {
    stubPrefersDark(false);
    applyTheme("dark");
    expect(root().classList.contains("dark")).toBe(true);
    expect(root().dataset.theme).toBe("dark");
    applyTheme("light");
    expect(root().classList.contains("dark")).toBe(false);
    expect(root().dataset.theme).toBe("light");
  });

  it("follows prefers-color-scheme for the system theme", () => {
    stubPrefersDark(true);
    applyTheme("system");
    expect(root().classList.contains("dark")).toBe(true);
    stubPrefersDark(false);
    applyTheme("system");
    expect(root().classList.contains("dark")).toBe(false);
  });
});

describe("THEME_SCRIPT", () => {
  it("applies and then tracks the OS preference while the theme is system", () => {
    const { media, listeners } = stubPrefersDark(true);
    root().dataset.theme = "system";
    new Function(THEME_SCRIPT)();
    expect(root().classList.contains("dark")).toBe(true);
    media.matches = false;
    listeners.forEach((listener) => listener());
    expect(root().classList.contains("dark")).toBe(false);
  });

  it("stays inert when the theme is not system", () => {
    const { listeners } = stubPrefersDark(true);
    root().dataset.theme = "light";
    new Function(THEME_SCRIPT)();
    listeners.forEach((listener) => listener());
    expect(root().classList.contains("dark")).toBe(false);
  });
});
