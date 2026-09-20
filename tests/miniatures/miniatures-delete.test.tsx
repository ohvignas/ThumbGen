// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import MiniaturesView from "@/app/miniatures/MiniaturesView";
import { useCanvasStore } from "@/store/canvas-store";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/components/agent-runs/RunIndicator", () => ({
  RunIndicator: () => null,
}));

const PROJECT = {
  id: "proj_ui_delete",
  name: "ui-delete-me",
  description: "throwaway",
  createdAt: "2026-09-18T15:00:00.000Z",
  updatedAt: "2026-09-18T15:00:00.000Z",
  imageCount: 2,
};

let container: HTMLDivElement;
let root: Root;
const fetchMock = vi.fn();
const cancelPendingSave = vi.fn();
let projects: typeof PROJECT[] = [PROJECT];

function routes(url: string, init?: RequestInit) {
  if (url === "/api/miniatures") {
    return { ok: true, json: async () => projects };
  }
  if (String(url).startsWith("/api/projects?id=") && init?.method === "DELETE") {
    projects = [];
    return { ok: true, json: async () => ({ success: true }) };
  }
  return { ok: false, json: async () => ({ error: "unexpected" }) };
}

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(async () => {
  projects = [PROJECT];
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => routes(url, init));
  vi.stubGlobal("fetch", fetchMock);
  useCanvasStore.setState({ currentProjectId: PROJECT.id, cancelPendingSave });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<MiniaturesView />));
  await flush();
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  fetchMock.mockReset();
  cancelPendingSave.mockClear();
});

describe("MiniaturesView delete", () => {
  it("asks for confirmation then DELETEs the project and drops the card", async () => {
    expect(document.body.textContent).toContain("ui-delete-me");
    const trigger = container.querySelector<HTMLButtonElement>('button[aria-label="Actions pour ui-delete-me"]');
    expect(trigger).not.toBeNull();

    await act(async () => trigger!.click());
    await flush();
    const menuDelete = Array.from(document.body.querySelectorAll<HTMLElement>("[role='menuitem']")).find((el) =>
      el.textContent?.includes("Supprimer"),
    );
    expect(menuDelete).toBeDefined();
    await act(async () => menuDelete!.click());
    await flush();

    expect(document.body.textContent).toContain("Supprimer ce projet ?");
    expect(fetchMock.mock.calls.some(([url, init]) => String(url).startsWith("/api/projects") && init?.method === "DELETE")).toBe(
      false,
    );

    const confirm = Array.from(document.body.querySelectorAll<HTMLButtonElement>("[role='dialog'] button")).find(
      (el) => el.textContent === "Supprimer",
    );
    expect(confirm).toBeDefined();
    await act(async () => confirm!.click());
    await flush();
    await flush();

    expect(cancelPendingSave).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/projects?id=proj_ui_delete", { method: "DELETE" });
    expect(document.body.textContent).toContain("Aucun projet pour l'instant");
  });

  it("keeps the card and shows the error when DELETE fails", async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (String(url).startsWith("/api/projects?id=") && init?.method === "DELETE") {
        return { ok: false, json: async () => ({ error: "Failed to delete" }) };
      }
      return routes(url, init);
    });
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="Actions pour ui-delete-me"]')!.click());
    await flush();
    await act(async () =>
      Array.from(document.body.querySelectorAll<HTMLElement>("[role='menuitem']"))
        .find((el) => el.textContent?.includes("Supprimer"))!
        .click(),
    );
    await flush();
    await act(async () =>
      Array.from(document.body.querySelectorAll<HTMLButtonElement>("[role='dialog'] button"))
        .find((el) => el.textContent === "Supprimer")!
        .click(),
    );
    await flush();

    expect(document.body.querySelector("[role='dialog'] [role='alert']")?.textContent).toBe(
      "La suppression a échoué. Réessaie.",
    );
    expect(document.body.textContent).toContain("ui-delete-me");
  });
});
