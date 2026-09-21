// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import AppSidebar from "@/components/panels/AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/navigation", () => ({
  usePathname: () => "/miniatures",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

let container: HTMLDivElement;
let root: Root;

async function renderSidebar(open: boolean) {
  await act(async () => {
    root.render(
      <TooltipProvider>
        <SidebarProvider defaultOpen={open} style={{ "--sidebar-width-icon": "4rem" } as React.CSSProperties}>
          <AppSidebar />
        </SidebarProvider>
      </TooltipProvider>,
    );
  });
}

beforeEach(async () => {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1280 });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
});

describe("collapsed sidebar rail", () => {
  it("centers every rail control on one full-width 32px row", async () => {
    await renderSidebar(false);

    const rail = container.querySelector('[data-slot="sidebar"][data-collapsible="icon"]');
    expect(rail).not.toBeNull();

    const home = container.querySelector('a[aria-label="ThumbGen home"]');
    expect(home?.className).toContain("group-data-[collapsible=icon]:h-8");
    expect(home?.className).toContain("group-data-[collapsible=icon]:w-full");

    const trigger = container.querySelector('[data-slot="sidebar-trigger"]');
    expect(trigger?.className).toContain("group-data-[collapsible=icon]:h-8");
    expect(trigger?.className).toContain("group-data-[collapsible=icon]:w-full");

    const buttons = [...container.querySelectorAll('[data-slot="sidebar-menu-button"]')];
    expect(buttons.length).toBe(5);
    for (const button of buttons) {
      expect(button.className).toContain("group-data-[collapsible=icon]:h-8!");
      expect(button.className).toContain("group-data-[collapsible=icon]:w-full!");
      expect(button.className).toContain("group-data-[collapsible=icon]:justify-center");
      expect(button.className).toContain("group-data-[collapsible=icon]:[&>span]:sr-only");
      expect(button.className).not.toContain("group-data-[collapsible=icon]:size-8!");
    }

    expect(container.querySelector('[data-slot="sidebar-header"]')?.className).toContain(
      "group-data-[collapsible=icon]:pb-0",
    );
    expect(container.querySelector('[data-slot="sidebar-menu"]')?.className).toContain(
      "group-data-[collapsible=icon]:gap-2",
    );
  });

  it("keeps the open sidebar as a labeled row, not an icon column", async () => {
    await renderSidebar(true);

    const rail = container.querySelector('[data-slot="sidebar"]');
    expect(rail?.getAttribute("data-collapsible")).toBe("");
    expect(container.textContent).toContain("Mes miniatures");
    expect(container.textContent).toContain("Vidéos");
    expect(container.textContent).toContain("ThumbGen");
  });
});
