// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { openSketchEditorDetail } from "@/lib/canvas/sketch-scene";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const captured: { props: Record<string, unknown> | null; tool: string | null } = {
  props: null,
  tool: null,
};

vi.mock("@excalidraw/excalidraw", () => ({
  Excalidraw: (props: Record<string, unknown>) => {
    captured.props = props;
    const api = props.excalidrawAPI as ((value: unknown) => void) | undefined;
    api?.({
      getSceneElements: () => [],
      getAppState: () => ({}),
      getFiles: () => ({}),
      updateScene: () => {},
      addFiles: () => {},
      setActiveTool: (tool: { type: string }) => {
        captured.tool = tool.type;
      },
    });
    return <div data-testid="excalidraw-mock" />;
  },
  exportToBlob: async () => new Blob(),
}));

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

describe("SketchEditor open", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    captured.props = null;
    captured.tool = null;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("/api/generated-sketches/")) {
          const bytes = Uint8Array.from(atob(PNG.split(",")[1]), (c) => c.charCodeAt(0));
          return { ok: true, blob: async () => new Blob([bytes], { type: "image/png" }) };
        }
        return { ok: true, blob: async () => new Blob(), json: async () => ({}) };
      }),
    );
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    vi.unstubAllGlobals();
  });

  it("hydrates an apply_workflow image into a drawable Excalidraw scene", async () => {
    const { default: SketchEditor } = await import("@/components/panels/SketchEditor");
    await act(async () => {
      root.render(<SketchEditor />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent("open-sketch-editor", {
          detail: openSketchEditorDetail("sketch-vault", {
            image_source: "generated:sk_vault",
            imageUrl: "/api/generated-sketches/sk_vault",
          }),
        }),
      );
    });
    for (let i = 0; i < 15 && !captured.props; i++) {
      await act(async () => {
        await Promise.resolve();
      });
    }

    expect(container.textContent).toContain("Éditeur de croquis");
    expect(captured.props).toBeTruthy();
    expect(captured.props?.viewModeEnabled).toBe(false);
    expect(captured.tool).toBe("freedraw");

    const initial = captured.props?.initialData as {
      elements: Array<{ type: string; fileId?: string }>;
      files?: Record<string, { dataURL: string }>;
      appState: { activeTool: { type: string }; viewModeEnabled: boolean };
    };
    expect(initial.elements.some((el) => el.type === "image")).toBe(true);
    expect(Object.values(initial.files ?? {}).some((file) => file.dataURL.startsWith("data:image/"))).toBe(true);
    expect(initial.appState.activeTool.type).toBe("freedraw");
    expect(initial.appState.viewModeEnabled).toBe(false);
  });
});
