// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import AgentHistoryMenu from "@/components/panels/AgentHistoryMenu";
import { useCanvasStore } from "@/store/canvas-store";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SNAPSHOTS = [
  { id: "snap-2", created_at: new Date().toISOString(), reason: "restore", node_count: 4, edge_count: 3 },
  { id: "snap-1", created_at: new Date().toISOString(), reason: "apply_workflow", node_count: 14, edge_count: 8 },
];

let container: HTMLDivElement;
let root: Root;
const fetchMock = vi.fn();
const loadProject = vi.fn<(projectId?: string) => Promise<void>>(async () => {
  calls.push("load");
});
const calls: string[] = [];
const flushPendingSave = vi.fn(async () => {
  calls.push("flush");
});
const cancelPendingSave = vi.fn(() => {
  calls.push("cancel");
});

function routes(url: string, init?: RequestInit) {
  if (url === "/api/project/proj-1/snapshots") {
    return { ok: true, json: async () => ({ snapshots: SNAPSHOTS }) };
  }
  if (url === "/api/project/proj-1/snapshots/snap-1/restore" && init?.method === "POST") {
    return { ok: true, json: async () => ({ success: true, updated_at: "2026-09-17T09:00:00.000Z" }) };
  }
  return { ok: false, json: async () => ({ error: "unexpected" }) };
}

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function byText(text: string): HTMLElement | undefined {
  return Array.from(document.body.querySelectorAll<HTMLElement>("button, [role='menuitem']")).find((el) =>
    el.textContent?.includes(text),
  );
}

beforeEach(async () => {
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => routes(url, init));
  vi.stubGlobal("fetch", fetchMock);
  calls.length = 0;
  useCanvasStore.setState({ currentProjectId: "proj-1", loadProject, flushPendingSave, cancelPendingSave });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<AgentHistoryMenu />));
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  fetchMock.mockReset();
  loadProject.mockClear();
  flushPendingSave.mockClear();
  cancelPendingSave.mockClear();
});

const trigger = () => container.querySelector<HTMLButtonElement>("button[aria-label=\"Historique de l'agent\"]")!;
const dialogButton = (label: string) =>
  Array.from(document.body.querySelectorAll<HTMLButtonElement>("[role='dialog'] button")).find(
    (el) => el.textContent === label,
  );

describe("AgentHistoryMenu", () => {
  it("lists the snapshots with their reason and time, then restores after confirmation", async () => {
    const trigger = container.querySelector<HTMLButtonElement>("button[aria-label=\"Historique de l'agent\"]");
    expect(trigger).not.toBeNull();

    await act(async () => trigger!.click());
    await flush();

    expect(fetchMock).toHaveBeenCalledWith("/api/project/proj-1/snapshots", { cache: "no-store" });
    const text = document.body.textContent ?? "";
    expect(text).toContain("Historique de l'agent");
    expect(text).toContain("Avant modification de l'agent");
    expect(text).toContain("Avant restauration");
    expect(text).toContain("14 étapes");

    const item = byText("Avant modification de l'agent");
    expect(item).toBeDefined();
    await act(async () => item!.click());
    await flush();

    // Nothing restored before the confirmation.
    expect(fetchMock).not.toHaveBeenCalledWith("/api/project/proj-1/snapshots/snap-1/restore", expect.anything());
    expect(document.body.textContent).toContain("Restaurer cet état du canvas ?");

    const confirm = Array.from(document.body.querySelectorAll<HTMLButtonElement>("[role='dialog'] button")).find(
      (el) => el.textContent === "Restaurer",
    );
    expect(confirm).toBeDefined();
    await act(async () => confirm!.click());
    await flush();

    expect(flushPendingSave).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/project/proj-1/snapshots/snap-1/restore", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(loadProject).toHaveBeenCalledWith("proj-1", { reason: "replace", force: true });
    expect(calls).toEqual(["flush", "cancel", "load"]);
  });

  it("shows a failed restore in its own alert line and keeps the dialog open", async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) =>
      String(url).endsWith("/restore")
        ? { ok: false, json: async () => ({ error: "Instantané introuvable" }) }
        : routes(url, init),
    );
    await act(async () => trigger().click());
    await flush();
    await act(async () => byText("Avant modification de l'agent")!.click());
    await flush();
    expect(document.body.querySelector("[role='dialog'] [role='alert']")).toBeNull();
    await act(async () => dialogButton("Restaurer")!.click());
    await flush();

    const alert = document.body.querySelector("[role='dialog'] [role='alert']");
    expect(alert?.textContent).toBe("Instantané introuvable");
    expect(document.body.querySelector("[role='dialog'] [data-slot='dialog-description']")?.textContent).not.toContain(
      "Instantané introuvable",
    );
    expect(loadProject).not.toHaveBeenCalled();
  });

  it("ignores a list response that arrives after a newer one", async () => {
    let releaseStale: () => void = () => {};
    let listCalls = 0;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith("/snapshots")) {
        listCalls++;
        if (listCalls === 1) {
          return new Promise((resolve) => {
            releaseStale = () => resolve({ ok: true, json: async () => ({ snapshots: [] }) });
          });
        }
      }
      return routes(url, init);
    });
    await act(async () => trigger().click()); // open: first request hangs
    await flush();
    await act(async () => trigger().click()); // close
    await flush();
    await act(async () => trigger().click()); // reopen: second request answers
    await flush();
    expect(listCalls).toBe(2);
    expect(document.body.textContent).toContain("14 étapes");

    await act(async () => releaseStale());
    await flush();
    expect(document.body.textContent).toContain("14 étapes");
    expect(document.body.textContent).not.toContain("Aucune modification");
  });

  it("cancelling the confirmation restores nothing", async () => {
    const trigger = container.querySelector<HTMLButtonElement>("button[aria-label=\"Historique de l'agent\"]");
    await act(async () => trigger!.click());
    await flush();
    await act(async () => byText("Avant modification de l'agent")!.click());
    await flush();
    const cancel = Array.from(document.body.querySelectorAll<HTMLButtonElement>("[role='dialog'] button")).find(
      (el) => el.textContent === "Annuler",
    );
    await act(async () => cancel!.click());
    await flush();
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/restore"))).toBe(false);
    expect(loadProject).not.toHaveBeenCalled();
  });

  it("says so when the agent has not changed the canvas yet", async () => {
    fetchMock.mockImplementation(async () => ({ ok: true, json: async () => ({ snapshots: [] }) }));
    const trigger = container.querySelector<HTMLButtonElement>("button[aria-label=\"Historique de l'agent\"]");
    await act(async () => trigger!.click());
    await flush();
    expect(document.body.textContent).toContain("Aucune modification de l'agent pour l'instant.");
  });
});
