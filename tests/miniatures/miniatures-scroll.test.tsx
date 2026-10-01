// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import MiniaturesPage from "@/app/miniatures/page";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/components/panels/AppSidebar", () => ({
  default: () => <nav aria-label="App" />,
}));

vi.mock("@/components/agent-runs/RunIndicator", () => ({
  RunIndicator: () => null,
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url === "/api/miniatures") {
        return {
          ok: true,
          json: async () =>
            Array.from({ length: 12 }, (_, i) => ({
              id: `proj_${i}`,
              name: `Projet ${i}`,
              description: "Une description assez longue pour occuper la carte.",
              createdAt: "2026-09-18T15:00:00.000Z",
              updatedAt: "2026-09-18T15:00:00.000Z",
              imageCount: 1,
              coverImageUrl: null,
            })),
        };
      }
      return { ok: false, json: async () => ({ error: "unexpected" }) };
    }),
  );
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<MiniaturesPage />);
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("Miniatures page scroll", () => {
  it("scrolls inside the inset because the document body cannot", () => {
    const main = container.querySelector("main");
    expect(main).not.toBeNull();
    expect(main?.className).toMatch(/\bh-svh\b/);
    expect(main?.className).toMatch(/\boverflow-y-auto\b/);
    expect(main?.tabIndex).toBe(-1);
    expect(document.activeElement).toBe(main);
    expect(container.textContent).toContain("Projet 11");
    expect(container.textContent).toContain("Mes miniatures");
  });
});
