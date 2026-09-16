import type { Theme } from "@/lib/settings-schema";

/**
 * Inline <head> script. While <html data-theme="system">, it mirrors
 * prefers-color-scheme onto the `dark` class and keeps following OS changes.
 * It reads data-theme on every change, so a client-side switch away from
 * « Système » (applyTheme) turns it off without a reload.
 */
export const THEME_SCRIPT =
  '(function(){try{var r=document.documentElement;var m=window.matchMedia("(prefers-color-scheme: dark)");' +
  'var s=function(){if(r.dataset.theme==="system"){r.classList.toggle("dark",m.matches);}};' +
  's();m.addEventListener("change",s);}catch(e){}})();';

/** Class rendered on <html> by the server; "system" is resolved by THEME_SCRIPT in the browser. */
export function serverThemeClass(theme: Theme): string {
  return theme === "dark" ? "dark" : "";
}

/** ui/sidebar.tsx writes sidebar_state=true|false; no cookie yet means open. */
export function sidebarDefaultOpen(cookieValue: string | undefined): boolean {
  return cookieValue !== "false";
}

/** Client only: applies a freshly saved theme without reloading the page. */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.dataset.theme = theme;
  const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.classList.toggle("dark", dark);
}
