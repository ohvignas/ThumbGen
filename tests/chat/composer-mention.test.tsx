// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import Composer from "@/components/panels/chat/Composer";
import { useChatStore } from "@/store/chat-store";
import { useCanvasStore } from "@/store/canvas-store";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  useChatStore.getState().reset();
  useCanvasStore.setState({
    nodes: [
      {
        id: "prev",
        type: "preview",
        position: { x: 0, y: 0 },
        data: {
          label: "Nano #1",
          generatedImages: ["/api/generated-images/image?id=p1", "/api/generated-images/image?id=abc123"],
          selectedImageIndex: 0,
        },
      },
    ],
    edges: [],
    coverImageUrl: null,
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  useCanvasStore.setState({ nodes: [], edges: [], coverImageUrl: null });
});

async function render(onSend = vi.fn()) {
  await act(async () => root.render(<Composer onSend={onSend} status="ready" onStop={() => {}} />));
  return onSend;
}

function textarea() {
  return container.querySelector("textarea")!;
}

async function typeDraft(value: string, cursor = value.length) {
  const el = textarea();
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
  await act(async () => {
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.setSelectionRange(cursor, cursor);
    el.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
  });
}

async function key(name: string, init: KeyboardEventInit = {}) {
  await act(async () => {
    textarea().dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true, ...init }));
  });
}

describe("composer @ mention picker", () => {
  it("opens on @ even when selectionStart is still 0", async () => {
    await render();
    const el = textarea();
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
    await act(async () => {
      setter.call(el, "@");
      el.setSelectionRange(0, 0);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(useChatStore.getState().draft).toBe("@");
    const list = container.querySelector('[role="listbox"]');
    expect(list?.getAttribute("aria-label")).toBe("Miniatures");
    expect(list?.textContent).toContain("#P1");
    expect(list?.textContent).toContain("Nano #1");
  });

  it("filters and Enter inserts @#P1 without sending", async () => {
    const onSend = await render();
    expect(container.querySelector('[role="listbox"]')).toBeNull();
    await typeDraft("@");
    expect(container.querySelector('[role="listbox"]')?.textContent).toContain("#ABC123");
    await typeDraft("@p1");
    expect(container.querySelector('[role="listbox"]')?.textContent).toContain("#P1");
    expect(container.querySelector('[role="listbox"]')?.textContent).not.toContain("#ABC123");
    await key("Enter");
    expect(onSend).not.toHaveBeenCalled();
    expect(useChatStore.getState().draft).toBe("@#P1 ");
    expect(container.querySelector('[role="listbox"]')).toBeNull();
  });

  it("does not open inside an email and Escape closes", async () => {
    await render();
    await typeDraft("user@host");
    expect(container.querySelector('[role="listbox"]')).toBeNull();
    await typeDraft("@");
    expect(container.querySelector('[role="listbox"]')).not.toBeNull();
    await key("Escape");
    expect(container.querySelector('[role="listbox"]')).toBeNull();
    expect(useChatStore.getState().draft).toBe("@");
  });

  it("lists only the on-canvas aperçu, not generator history slots", async () => {
    useCanvasStore.setState({
      nodes: [
        {
          id: "prev",
          type: "preview",
          position: { x: 0, y: 0 },
          data: {
            label: "GPT Image 2.5 Sunburst (précis) #2",
            generatedImages: ["/api/generated-images/image?id=e69ac3"],
          },
        },
        {
          id: "gen-a",
          type: "generator",
          position: { x: 0, y: 0 },
          data: {
            generatedImagesByVariant: {
              A: ["/api/generated-images/image?id=f9010b", "/api/generated-images/image?id=e69ac3"],
            },
          },
        },
        {
          id: "gen-b",
          type: "generator",
          position: { x: 0, y: 0 },
          data: {
            generatedImagesByVariant: {
              A: ["/api/generated-images/image?id=0f6a5f", "/api/generated-images/image?id=05d2c7"],
            },
          },
        },
      ],
      coverImageUrl: "/api/generated-images/image?id=e69ac3",
    });
    await render();
    await typeDraft("@");
    const list = container.querySelector('[role="listbox"]');
    expect(list?.querySelectorAll('[role="option"]')).toHaveLength(1);
    expect(list?.textContent).toContain("#E69AC3");
    expect(list?.textContent).toContain("gagnante");
    expect(list?.textContent).not.toContain("#F9010B");
    expect(list?.textContent).not.toContain("#0F6A5F");
    expect(list?.textContent).not.toContain("#05D2C7");
  });

  it("sends on Enter when the query matches nothing", async () => {
    const onSend = await render();
    await typeDraft("@zzzz-nope");
    expect(container.textContent).toContain("Aucune miniature");
    await key("Enter");
    expect(onSend).toHaveBeenCalledTimes(1);
  });
});
