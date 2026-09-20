// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import ProjectBar from "@/components/panels/ProjectBar";
import { useCanvasStore } from "@/store/canvas-store";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (String(url).startsWith("/api/projects")) {
        return { ok: true, json: async () => [{ id: "proj-1", name: "Clip test", createdAt: "", updatedAt: "" }] };
      }
      return { ok: true, json: async () => ({}) };
    }),
  );
  useCanvasStore.setState({
    currentProjectId: "proj-1",
    dirty: false,
    saving: false,
    saveError: null,
    lastSavedAt: "2026-09-18T21:31:00.000Z",
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<ProjectBar />);
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

describe("ProjectBar save status", () => {
  it("shows Enregistré and the last save datetime next to the project name", () => {
    expect(container.textContent).toContain("Clip test");
    expect(container.textContent).toContain("Enregistré");
    expect(container.textContent).toMatch(/18\/09\/2026/);
    expect(container.querySelector("[data-save-status='saved']")).not.toBeNull();
  });

  it("shows Enregistrement… while dirty and Erreur de sauvegarde as a retry control", async () => {
    await act(async () => {
      useCanvasStore.setState({ dirty: true, saving: false, saveError: null });
    });
    expect(container.textContent).toContain("Enregistrement…");

    await act(async () => {
      useCanvasStore.setState({ dirty: false, saving: false, saveError: "Erreur de sauvegarde" });
    });
    const retry = container.querySelector<HTMLButtonElement>("[data-save-status='error'] button");
    expect(retry?.textContent).toBe("Erreur de sauvegarde");
  });
});
