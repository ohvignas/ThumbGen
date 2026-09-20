// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Toaster, toast, toastManager } from "@/components/ui/toast";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  document.body.innerHTML = "";
  vi.useRealTimers();
  delete (globalThis as { BASE_UI_ANIMATIONS_DISABLED?: boolean }).BASE_UI_ANIMATIONS_DISABLED;
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

  it("closes action toasts after 10 s and plain info toasts after 8 s", () => {
    const add = vi.spyOn(toastManager, "add").mockImplementation(() => "id");
    toast({ title: "L'agent a fini — Vidéo F1", action: { label: "Ouvrir", onClick: () => {} } });
    toast({ title: "L'agent travaille déjà ici" });
    toast({ title: "stay", timeout: 0 });
    expect(add.mock.calls.map((call) => call[0].timeout)).toEqual([10_000, 8000, 0]);
    add.mockRestore();
  });

  it("dismisses each stacked action toast 10 s after it appeared", async () => {
    vi.useFakeTimers();
    (globalThis as { BASE_UI_ANIMATIONS_DISABLED?: boolean }).BASE_UI_ANIMATIONS_DISABLED = true;
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => root!.render(<Toaster />));

    await act(async () => {
      toast({ id: "run-a", title: "L'agent a fini — A", action: { label: "Ouvrir", onClick: () => {} } });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_000);
    });
    await act(async () => {
      toast({ id: "run-b", title: "L'agent a fini — B", action: { label: "Ouvrir", onClick: () => {} } });
    });
    expect(document.body.textContent).toContain("L'agent a fini — A");
    expect(document.body.textContent).toContain("L'agent a fini — B");
    expect([...document.querySelectorAll("button")].filter((button) => button.textContent === "Ouvrir")).toHaveLength(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(6_000);
    });
    expect(document.body.textContent).not.toContain("L'agent a fini — A");
    expect(document.body.textContent).toContain("L'agent a fini — B");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_000);
    });
    expect(document.body.textContent).not.toContain("L'agent a fini — B");
  });

  it("closes an action toast when its X is clicked", async () => {
    (globalThis as { BASE_UI_ANIMATIONS_DISABLED?: boolean }).BASE_UI_ANIMATIONS_DISABLED = true;
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => root!.render(<Toaster />));
    await act(async () => {
      toast({ id: "run-x", title: "L'agent a fini — X", action: { label: "Ouvrir", onClick: () => {} } });
    });
    await act(async () => {
      (document.querySelector('[aria-label="Fermer"]') as HTMLButtonElement).click();
    });
    expect(document.body.textContent).not.toContain("L'agent a fini — X");
  });
});
