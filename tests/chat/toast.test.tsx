// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Toaster, toast } from "@/components/ui/toast";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

describe("toast", () => {
  it("shows a toast with its title and action button", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => root!.render(<Toaster />));

    const onClick = vi.fn();
    await act(async () => {
      toast({ id: "run-1", title: "L'agent a fini — Vidéo F1", action: { label: "Ouvrir", onClick } });
    });
    expect(document.body.textContent).toContain("L'agent a fini — Vidéo F1");

    const open = [...document.querySelectorAll("button")].find((button) => button.textContent === "Ouvrir");
    expect(open).toBeDefined();
    await act(async () => open!.click());
    expect(onClick).toHaveBeenCalledTimes(1);

    // Same id: updated in place, never duplicated.
    await act(async () => {
      toast({ id: "run-1", title: "L'agent a fini — Vidéo F1" });
    });
    expect(document.body.textContent?.split("L'agent a fini — Vidéo F1").length).toBe(2);
  });
});
