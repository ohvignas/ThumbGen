// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import NodeShell from "@/components/nodes/NodeShell";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  document.body.innerHTML = "";
});

describe("NodeShell extra menu items", () => {
  it("offers Miniature gagnante from the overflow menu", async () => {
    const onCover = vi.fn();
    await act(async () => {
      root.render(
        <NodeShell title="Aperçu" extraMenuItems={[{ label: "Miniature gagnante", onClick: onCover }]}>
          image
        </NodeShell>,
      );
    });

    const trigger = container.querySelector<HTMLButtonElement>('button[aria-label="Actions du nœud"]');
    expect(trigger).not.toBeNull();
    await act(async () => trigger!.click());

    const item = Array.from(container.querySelectorAll("button")).find((el) => el.textContent === "Miniature gagnante");
    expect(item).toBeDefined();
    await act(async () => item!.click());
    expect(onCover).toHaveBeenCalledTimes(1);
  });
});
