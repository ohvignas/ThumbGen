// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import PromptNode from "@/components/nodes/PromptNode";
import { resetFocusedDrafts } from "@/components/nodes/use-focused-draft";
import { useCanvasStore, type AppNode } from "@/store/canvas-store";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@xyflow/react", () => ({
  Handle: () => null,
  Position: { Left: "left", Right: "right", Top: "top", Bottom: "bottom" },
}));

const SPACED =
  "white sans-serif, top third of the frame, thick black outline around the letters";

function seed(data: AppNode["data"]) {
  useCanvasStore.setState({
    nodes: [{ id: "prompt-1", type: "prompt", position: { x: 0, y: 0 }, data }],
    edges: [],
    loaded: true,
    loading: false,
  });
}

function Harness() {
  const node = useCanvasStore((s) => s.nodes.find((item) => item.id === "prompt-1"));
  if (!node) return null;
  return <PromptNode id={node.id} data={node.data} />;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  seed({ prompt: SPACED, negativePrompt: "blurry, low resolution" });
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  document.body.innerHTML = "";
  resetFocusedDrafts();
});

async function renderEditor() {
  await act(async () => {
    root.render(<Harness />);
  });
}

function promptField() {
  return container.querySelector<HTMLTextAreaElement>('textarea[aria-label="Prompt"]')!;
}

function negativeField() {
  return container.querySelector<HTMLTextAreaElement>('textarea[aria-label="Negative prompt"]')!;
}

function setter() {
  return Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
}

function typeInto(field: HTMLTextAreaElement, value: string) {
  setter().call(field, value);
  field.dispatchEvent(new Event("input", { bubbles: true }));
}

function focusField(field: HTMLTextAreaElement) {
  field.focus();
  field.dispatchEvent(new FocusEvent("focus", { bubbles: true }));
}

function blurField(field: HTMLTextAreaElement) {
  field.blur();
  field.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
}

async function insertAt(field: HTMLTextAreaElement, index: number, text: string) {
  await act(async () => {
    focusField(field);
    const next = field.value.slice(0, index) + text + field.value.slice(index);
    setter().call(field, next);
    field.setSelectionRange(index + text.length, index + text.length);
    field.dispatchEvent(new InputEvent("input", { bubbles: true, data: text, inputType: "insertText" }));
  });
}

describe("PromptNode editor", () => {
  it("shows stored spaces instead of collapsing the prompt into one jammed word", async () => {
    await renderEditor();
    expect(promptField().value).toBe(SPACED);
    expect(promptField().value).toContain(" ");
    expect(promptField().className).toMatch(/whitespace-pre-wrap/);
    expect(promptField().style.whiteSpace).toBe("pre-wrap");
  });

  it("keeps the editor out of React Flow drag / pan / wheel / delete", async () => {
    await renderEditor();
    const shell = promptField().parentElement;
    expect(shell?.className).toMatch(/\bnodrag\b/);
    expect(shell?.className).toMatch(/\bnowheel\b/);
    expect(shell?.className).toMatch(/\bnopan\b/);
    expect(shell?.className).toMatch(/\bnokey\b/);
    expect(promptField().className).toMatch(/\bnodrag\b/);
    expect(promptField().className).toMatch(/\bnowheel\b/);
    expect(negativeField().className).toMatch(/\bnodrag\b/);
    expect(negativeField().className).toMatch(/\bnowheel\b/);
  });

  it("types spaces and keeps them on the node", async () => {
    await renderEditor();
    await act(async () => {
      focusField(promptField());
      typeInto(promptField(), "hello world from the prompt");
      blurField(promptField());
    });
    expect(useCanvasStore.getState().nodes[0]?.data.prompt).toBe("hello world from the prompt");
    expect(promptField().value).toBe("hello world from the prompt");
  });

  it("edits the negative prompt the same way", async () => {
    await renderEditor();
    await act(async () => {
      focusField(negativeField());
      typeInto(negativeField(), "blurry watermark extra fingers");
      blurField(negativeField());
    });
    expect(useCanvasStore.getState().nodes[0]?.data.negativePrompt).toBe("blurry watermark extra fingers");
    expect(negativeField().value).toBe("blurry watermark extra fingers");
  });

  it("keeps the caret in the middle after each keystroke, even if the store updates", async () => {
    seed({ prompt: "hello world" });
    await renderEditor();
    const field = promptField();
    await insertAt(field, 5, "X");
    expect(field.value).toBe("helloX world");
    expect(field.selectionStart).toBe(6);
    expect(field.selectionEnd).toBe(6);

    await act(async () => {
      useCanvasStore.getState().updateNodeData("prompt-1", { prompt: "STORE OVERWRITE AT THE END!!!!" });
    });
    expect(field.value).toBe("helloX world");
    expect(field.selectionStart).toBe(6);

    await insertAt(field, 6, "Y");
    expect(field.value).toBe("helloXY world");
    expect(field.selectionStart).toBe(7);
    expect(field.selectionEnd).toBe(7);

    await act(async () => blurField(field));
    expect(field.selectionStart).toBe(7);
    expect(useCanvasStore.getState().nodes[0]?.data.prompt).toBe("helloXY world");
  });

  it("keeps the caret in the middle of the negative prompt", async () => {
    seed({ prompt: "scene", negativePrompt: "blurry text" });
    await renderEditor();
    const field = negativeField();
    await insertAt(field, 6, "X");
    expect(field.value).toBe("blurryX text");
    expect(field.selectionStart).toBe(7);
    await act(async () => {
      useCanvasStore.getState().updateNodeData("prompt-1", { negativePrompt: "changed from store" });
    });
    expect(field.value).toBe("blurryX text");
    expect(field.selectionStart).toBe(7);
  });

  it("does not write the canvas store on the keystroke itself", async () => {
    seed({ prompt: "hello world" });
    await renderEditor();
    await insertAt(promptField(), 5, "X");
    expect(promptField().value).toBe("helloX world");
    expect(useCanvasStore.getState().nodes[0]?.data.prompt).toBe("hello world");
    await act(async () => blurField(promptField()));
    expect(useCanvasStore.getState().nodes[0]?.data.prompt).toBe("helloX world");
  });

  it("stops pointer and keyboard events from reaching the flow", async () => {
    await renderEditor();
    const key = new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true });
    const keyStop = vi.spyOn(key, "stopPropagation");
    promptField().dispatchEvent(key);
    expect(keyStop).toHaveBeenCalled();

    const pointer = new Event("pointerdown", { bubbles: true, cancelable: true });
    const pointerStop = vi.spyOn(pointer, "stopPropagation");
    promptField().dispatchEvent(pointer);
    expect(pointerStop).toHaveBeenCalled();
  });

  it("keeps Améliorer le prompt when the prompt is filled", async () => {
    const fetchMock = vi.fn(async () => ({
      json: async () => ({ enhanced: "A spaced enhanced prompt for the thumbnail." }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    await renderEditor();
    const button = Array.from(container.querySelectorAll("button")).find((el) =>
      el.textContent?.includes("Améliorer le prompt"),
    );
    expect(button).toBeDefined();
    await act(async () => button!.click());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/enhance-prompt",
      expect.objectContaining({ method: "POST" }),
    );
    expect(useCanvasStore.getState().nodes[0]?.data.prompt).toBe(
      "A spaced enhanced prompt for the thumbnail.",
    );
    vi.unstubAllGlobals();
  });

  it("can scroll and resize a long prompt instead of clipping it to a 96px card", async () => {
    seed({ prompt: `${SPACED} `.repeat(40).trim() });
    await renderEditor();
    expect(promptField().className).toMatch(/\bmin-h-40\b/);
    expect(promptField().className).toMatch(/\bmax-h-80\b/);
    expect(promptField().className).toMatch(/\bresize-y\b/);
    expect(promptField().className).toMatch(/\boverflow-y-auto\b/);
    expect(promptField().value.split(" ").length).toBeGreaterThan(40);
  });
});
