// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import CanvasHeaderActions from "@/components/panels/CanvasHeaderActions";
import { useCanvasStore } from "@/store/canvas-store";
import { debugLog, resetDebugLogs } from "@/lib/debug-log";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(async () => {
  resetDebugLogs();
  localStorage.removeItem("thumbgen.logs.view");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (String(url).startsWith("/api/projects")) {
        return { ok: true, json: async () => [{ id: "proj-1", name: "Clip test" }] };
      }
      if (String(url).startsWith("/api/debug-logs")) {
        return { ok: true, json: async () => ({ entries: [] }) };
      }
      return { ok: true, json: async () => ({}) };
    }),
  );
  useCanvasStore.setState({
    currentProjectId: "proj-1",
    nodes: [{ id: "p-1", type: "prompt", position: { x: 0, y: 0 }, data: { prompt: "Full anatomy sentence one." } }],
    edges: [],
    coverImageUrl: null,
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<CanvasHeaderActions />);
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
  resetDebugLogs();
});

describe("CanvasHeaderActions", () => {
  it("puts Exporter le blueprint and Logs in the same top-right header", () => {
    expect(container.querySelector("[data-canvas-header-actions]")).not.toBeNull();
    expect(container.textContent).toContain("Exporter le blueprint");
    expect(container.textContent).toContain("Logs");
    expect(container.querySelector("[data-blueprint-export]")).not.toBeNull();
    const logs = container.querySelector("[data-workflow-logs]");
    expect(logs).not.toBeNull();
    expect(logs?.getAttribute("data-error-count")).toBe("0");
    expect(container.querySelector("[data-workflow-log-errors]")).toBeNull();
  });

  it("turns the Logs button red and shows the error count", async () => {
    await act(async () => {
      debugLog("generate", "job error", { projectId: "proj-1", previewId: "pv-1", variant: "A", error: "timeout" });
      debugLog("canvas-save", "ok", { projectId: "proj-1", nodes: 1 });
      debugLog("agent", "tool throw", { projectId: "proj-1", name: "place_node", error: "boom" });
    });
    const logs = container.querySelector("[data-workflow-logs]");
    expect(logs?.getAttribute("data-error-count")).toBe("2");
    expect(logs?.getAttribute("aria-label")).toBe("Logs, 2 erreurs");
    expect(container.querySelector("[data-workflow-log-errors]")?.textContent).toBe("2");

    await act(async () => {
      container.querySelector<HTMLButtonElement>("[data-workflow-logs]")?.click();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const errorRow = document.body.querySelector("[data-log-level='error']");
    expect(errorRow).not.toBeNull();
    expect(document.body.textContent).toContain("job error");
    expect(document.body.textContent).toContain("timeout");
    expect(document.body.textContent).toContain("pv-1");
    expect(document.body.querySelector("[data-workflow-log-list]")?.getAttribute("data-logs-view")).toBe("workflow");
    const scopes = [...document.body.querySelectorAll("[data-workflow-log-row]")].map((el) => el.getAttribute("data-log-scope"));
    expect(scopes).toContain("generate");
    expect(scopes).toContain("agent");
    expect(scopes).not.toContain("canvas-save");
  });

  it("downloads thumbgen-blueprint-<projectId>.json with the full prompt", async () => {
    const createObjectURL = vi.fn(() => "blob:test");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });
    const click = vi.fn();
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = realCreate(tag);
      if (tag === "a") Object.defineProperty(el, "click", { value: click });
      return el;
    });

    await act(async () => {
      container.querySelector<HTMLButtonElement>("[data-blueprint-export] button")?.click();
    });

    expect(createObjectURL).toHaveBeenCalled();
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    expect(blob.type).toBe("application/json");
    const text = await blob.text();
    expect(text).toContain("Full anatomy sentence one.");
    expect(text).toContain('"id": "proj-1"');
    expect(click).toHaveBeenCalled();
    const link = click.mock.instances[0] as HTMLAnchorElement;
    expect(link.download).toBe("thumbgen-blueprint-proj-1.json");
  });

  it("copies the visible workflow logs, with an optional full dump", async () => {
    await act(async () => {
      debugLog("agent", "place_node wrote", { projectId: "proj-1", nodeId: "iv-prompt" });
      debugLog("canvas-save", "ok", { projectId: "proj-1", nodes: 1 });
      debugLog("canvas-load", "GET", { projectId: "proj-1", nodes: 1 });
    });
    const writeText = vi.fn(async () => {});
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });

    await act(async () => {
      container.querySelector<HTMLButtonElement>("[data-workflow-logs]")?.click();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const copy = document.body.querySelector<HTMLButtonElement>("[data-copy-visible]");
    expect(copy).toBeTruthy();
    await act(async () => {
      copy?.click();
    });
    expect(writeText).toHaveBeenCalled();
    const copied = writeText.mock.calls[0][0] as string;
    expect(copied).toContain("place_node wrote");
    expect(copied).toContain("[agent]");
    expect(copied).not.toContain("canvas-save");
    expect(copied).not.toContain("canvas-load");

    const copyAll = document.body.querySelector<HTMLButtonElement>("[data-copy-all]");
    expect(copyAll).toBeTruthy();
    await act(async () => {
      copyAll?.click();
    });
    const dumped = writeText.mock.calls[1][0] as string;
    expect(dumped).toContain("place_node wrote");
    expect(dumped).toContain("canvas-save");
    expect(dumped).toContain("canvas-load");
  });

  it("defaults to workflow events and reveals process noise on toggle", async () => {
    await act(async () => {
      debugLog("generate", "start", { projectId: "proj-1", model: "openai/gpt-image-1" });
      debugLog("canvas-save", "db wrote", { projectId: "proj-1", nodes: 8 });
      debugLog("canvas-load", "poll skip known", { projectId: "proj-1" });
      debugLog("canvas-load", "GET", { projectId: "proj-1", nodes: 8 });
      debugLog("canvas-save", "HTTP error", { projectId: "proj-1", status: 500 }, "error");
    });

    const logs = container.querySelector("[data-workflow-logs]");
    expect(logs?.getAttribute("data-error-count")).toBe("1");

    await act(async () => {
      container.querySelector<HTMLButtonElement>("[data-workflow-logs]")?.click();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(document.body.textContent).toContain("start");
    expect(document.body.textContent).toContain("HTTP error");
    expect(document.body.textContent).not.toContain("db wrote");
    expect(document.body.textContent).not.toContain("poll skip known");
    expect(document.body.querySelector("[data-workflow-log-list]")?.textContent).not.toContain("GET");

    await act(async () => {
      document.body.querySelector<HTMLButtonElement>("[data-logs-view-option='all']")?.click();
    });
    expect(document.body.querySelector("[data-workflow-log-list]")?.getAttribute("data-logs-view")).toBe("all");
    expect(document.body.textContent).toContain("db wrote");
    expect(document.body.textContent).toContain("poll skip known");
    expect(localStorage.getItem("thumbgen.logs.view")).toBe("all");
    expect(container.querySelector("[data-workflow-logs]")?.getAttribute("data-error-count")).toBe("1");
  });
});
