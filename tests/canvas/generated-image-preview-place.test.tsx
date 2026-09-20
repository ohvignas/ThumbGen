// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import GeneratedImagePreview from "@/components/panels/chat/tool-renderers/GeneratedImagePreview";
import { resetPinnedChatSketchesForTests, useCanvasStore, type AppNode } from "@/store/canvas-store";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function part(sketchId: string) {
  return {
    output: {
      content: [
        { type: "text", text: `Sketch generated. Reference: generated:${sketchId} (cost: $0.010)` },
        { type: "image", mimeType: "image/png", data: "QUJD" },
      ],
    },
  };
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  resetPinnedChatSketchesForTests();
  useCanvasStore.setState({
    nodes: [{ id: "gen", type: "generator", position: { x: 400, y: 0 }, data: {} } as AppNode],
    edges: [],
    loaded: true,
    saving: false,
    dirty: false,
    currentProjectId: "proj_click",
    deletedNodeIds: [],
    deletedEdgeIds: [],
    history: [{ nodes: [], edges: [] }],
    historyIndex: 0,
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("GeneratedImagePreview + canvas", () => {
  it("places a new persistable sketch per click and never reloads the project", async () => {
    const loadProject = vi.fn();
    useCanvasStore.setState({ loadProject } as never);
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { sketch_id: string };
      const id = body.sketch_id === "sk_one" ? "sketch-aaaa1111" : "sketch-bbbb2222";
      return {
        ok: true,
        json: async () => ({
          sketchNodeId: id,
          position: { x: 0, y: 0 },
          image_source: `generated:${body.sketch_id}`,
          imageUrl: `/api/generated-sketches/${body.sketch_id}`,
          edge: { id: `e-${id}`, source: id, target: "gen", targetHandle: "sketch-in" },
        }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    await act(async () => {
      root.render(
        <>
          <GeneratedImagePreview part={part("sk_one")} />
          <GeneratedImagePreview part={part("sk_two")} />
        </>,
      );
    });
    const buttons = [...container.querySelectorAll("button")].filter((el) => el.textContent?.includes("+ canvas"));
    expect(buttons).toHaveLength(2);
    await act(async () => {
      buttons[0].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await act(async () => {
      buttons[1].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const sketches = useCanvasStore.getState().nodes.filter((n) => n.type === "sketch");
    expect(sketches.map((n) => n.id)).toEqual(["sketch-aaaa1111", "sketch-bbbb2222"]);
    expect(sketches[0].data.image_source).toBe("generated:sk_one");
    expect(sketches[1].data.image_source).toBe("generated:sk_two");
    expect(sketches[0].data.imageUrl).toBe("/api/generated-sketches/sk_one");
    expect(loadProject).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls.filter(([url]) => String(url) === "/api/agent/apply-sketch")).toHaveLength(2);
  });

  it("places another copy on a second click of the same croquis and stays enabled", async () => {
    let n = 0;
    const fetchMock = vi.fn(async () => {
      n += 1;
      const id = n === 1 ? "sketch-aaaa1111" : "sketch-bbbb2222";
      return {
        ok: true,
        json: async () => ({
          sketchNodeId: id,
          position: { x: 0, y: n * 10 },
          image_source: "generated:sk_one",
          imageUrl: "/api/generated-sketches/sk_one",
        }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    await act(async () => {
      root.render(<GeneratedImagePreview part={part("sk_one")} />);
    });
    const button = [...container.querySelectorAll("button")].find((el) => el.textContent?.includes("+ canvas"));
    expect(button).toBeTruthy();
    await act(async () => {
      button!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(button!.disabled).toBe(false);
    expect(button!.textContent).toContain("+ canvas");
    await act(async () => {
      button!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const sketches = useCanvasStore.getState().nodes.filter((n) => n.type === "sketch");
    expect(sketches.map((n) => n.id)).toEqual(["sketch-aaaa1111", "sketch-bbbb2222"]);
    expect(useCanvasStore.getState().edges).toEqual([]);
    expect(fetchMock.mock.calls.filter(([url]) => String(url) === "/api/agent/apply-sketch")).toHaveLength(2);
  });
});
