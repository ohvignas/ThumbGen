// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import Composer from "@/components/panels/chat/Composer";
import { useChatStore } from "@/store/chat-store";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  useChatStore.getState().reset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

async function render(onSend = vi.fn(), surface?: "canvas" | "studio") {
  await act(async () =>
    root.render(<Composer onSend={onSend} status="ready" onStop={() => {}} surface={surface} />),
  );
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

describe("composer slash picker", () => {
  it("uses writing-studio placeholder on studio, never miniature or croquis", async () => {
    await render(vi.fn(), "studio");
    const placeholder = textarea().getAttribute("placeholder") ?? "";
    expect(placeholder).toContain("Décris l’idée de la vidéo");
    expect(placeholder).not.toMatch(/\/ecrire|envoie/i);
    expect(placeholder).not.toMatch(/miniature|croquis/i);
  });

  it("opens on / even when selectionStart is still 0 (stale cursor after insert)", async () => {
    await render();
    const el = textarea();
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
    await act(async () => {
      setter.call(el, "/");
      el.setSelectionRange(0, 0);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(useChatStore.getState().draft).toBe("/");
    expect(container.querySelector('[role="listbox"]')?.textContent).toContain("Croquis");
  });

  it("opens on / at the start, filters, and Enter inserts /croquis without sending", async () => {
    const onSend = await render();
    expect(container.querySelector('[role="listbox"]')).toBeNull();
    await typeDraft("/");
    expect(container.querySelector('[role="listbox"]')?.textContent).toContain("Croquis");
    await typeDraft("/cro");
    expect(container.querySelector('[role="listbox"]')?.textContent).toContain("Croquis");
    expect(container.querySelector('[role="listbox"]')?.textContent).not.toContain("/miniature");
    await key("Enter");
    expect(onSend).not.toHaveBeenCalled();
    expect(useChatStore.getState().draft).toBe("/croquis ");
    expect(container.querySelector('[role="listbox"]')).toBeNull();
  });

  it("filters Create prompt and Enter inserts /create-prompt", async () => {
    const onSend = await render();
    await typeDraft("/create");
    expect(container.querySelector('[role="listbox"]')?.textContent).toContain("Create prompt");
    expect(container.querySelector('[role="listbox"]')?.textContent).toContain("/create-prompt");
    expect(container.querySelector('[role="listbox"]')?.textContent).not.toContain("/create-propt");
    await key("Enter");
    expect(onSend).not.toHaveBeenCalled();
    expect(useChatStore.getState().draft).toBe("/create-prompt ");
    expect(container.querySelector('[role="listbox"]')).toBeNull();
  });

  it("does not open inside a URL and Escape closes", async () => {
    await render();
    await typeDraft("https://youtube.com/watch");
    expect(container.querySelector('[role="listbox"]')).toBeNull();
    await typeDraft("/");
    expect(container.querySelector('[role="listbox"]')).not.toBeNull();
    await key("Escape");
    expect(container.querySelector('[role="listbox"]')).toBeNull();
    expect(useChatStore.getState().draft).toBe("/");
  });

  it("sends on Enter when the query matches nothing", async () => {
    const onSend = await render();
    await typeDraft("/zzzz-nope");
    expect(container.textContent).toContain("Aucune skill");
    await key("Enter");
    expect(onSend).toHaveBeenCalledTimes(1);
  });
});
