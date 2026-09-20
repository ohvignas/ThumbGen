// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ReactFlowProvider } from "@xyflow/react";
import type { UIMessage } from "ai";
import TurnActions from "@/components/panels/chat/TurnActions";
import { splitAssistantTurn } from "@/components/panels/chat/turn-model";
import { useCanvasStore, type AppNode } from "@/store/canvas-store";
import { GENERATE_NODE_EVENT } from "@/lib/canvas/generate-node-event";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
const events: unknown[] = [];
const listener = (event: Event) => events.push((event as CustomEvent).detail);

const generatorNode: AppNode = {
  id: "iv-generator",
  type: "generator",
  position: { x: 0, y: 0 },
  data: { model: "gemini-3.1-flash-image" },
};

function seed(nodes: AppNode[]) {
  useCanvasStore.setState({ nodes, edges: [], loaded: true });
}

async function render() {
  await act(async () =>
    root.render(
      <ReactFlowProvider>
        <TurnActions actions={[{ kind: "generate", nodeId: "iv-generator" }]} onAskAgent={() => {}} />
      </ReactFlowProvider>,
    ),
  );
}

const generateButton = () => container.querySelector<HTMLButtonElement>("button");

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  events.length = 0;
  window.addEventListener(GENERATE_NODE_EVENT, listener);
  seed([generatorNode]);
});

afterEach(async () => {
  await act(async () => root.unmount());
  window.removeEventListener(GENERATE_NODE_EVENT, listener);
  container.remove();
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("TurnActions — generate", () => {
  it("shows the label computed from the node and follows its settings", async () => {
    await render();
    expect(generateButton()?.textContent).toContain("Générer · 1 image · ~0,02 $");
    await act(async () => useCanvasStore.getState().updateNodeData("iv-generator", { numImages: 2 }));
    expect(generateButton()?.textContent).toContain("Générer · 2 images · ~0,04 $");
  });

  it("dispatches the generation event only on click, once, and selects the node", async () => {
    await render();
    await render();
    expect(events).toEqual([]);
    await act(async () => generateButton()!.click());
    expect(events).toEqual([{ nodeId: "iv-generator" }]);
    expect(useCanvasStore.getState().nodes.find((n) => n.id === "iv-generator")?.selected).toBe(true);
  });

  it("is disabled when the node is gone", async () => {
    seed([]);
    await render();
    const button = generateButton()!;
    expect(button.getAttribute("aria-disabled") === "true" || button.disabled).toBe(true);
    await act(async () => button.click());
    expect(events).toEqual([]);
    expect(button.textContent).toBe("Générer");
    // The tooltip trigger wraps the disabled button (content « Élément introuvable » opens on hover).
    expect(button.getAttribute("data-disabled")).not.toBeNull();
  });

  it("is disabled while the generator runs", async () => {
    seed([{ ...generatorNode, data: { ...generatorNode.data, isGenerating: true } }]);
    await render();
    expect(generateButton()!.disabled).toBe(true);
    expect(generateButton()!.textContent).toContain("Génération en cours");
  });
});

describe("turn model — generate action", () => {
  it("never maps finish_turn generate / focus chips into the chat", () => {
    const message = {
      id: "m1",
      role: "assistant",
      parts: [
        {
          type: "tool-finish_turn",
          toolCallId: "f1",
          state: "output-available",
          input: { summary: "Workflow prêt.", next_actions: [{ kind: "generate", node_id: "iv-generator" }] },
          output: { content: [] },
        },
      ],
    } as unknown as UIMessage;
    expect(splitAssistantTurn(message).nextActions).toEqual([]);
  });
});
