import { describe, it, expect } from "vitest";
import {
  isPromptOnlyCanvasWrite,
  mergePromptCards,
  promptCardsFromTool,
} from "@/components/panels/chat/prompt-cards";

const PROMPT =
  "Young man in the left third, OpenClaw mascot on fire. Text OPENCLAW EST MORT.";

describe("promptCardsFromTool", () => {
  it("reads place_node prompt data", () => {
    expect(
      promptCardsFromTool("place_node", {
        node: { id: "iv-prompt", type: "prompt", data: { prompt: PROMPT, negativePrompt: "blurry" } },
      }),
    ).toEqual([{ nodeId: "iv-prompt", prompt: PROMPT }]);
  });

  it("reads apply_workflow when blueprint is a JSON string (live OpenRouter shape)", () => {
    const cards = promptCardsFromTool("apply_workflow", {
      project_id: "proj_1",
      blueprint: JSON.stringify({
        nodes: [{ id: "prompt-1", type: "prompt", data: { prompt: PROMPT } }],
        edges: [],
      }),
    });
    expect(cards).toEqual([{ nodeId: "prompt-1", prompt: PROMPT }]);
  });

  it("reads a bare nodes array (create-prompt skill example)", () => {
    expect(
      promptCardsFromTool("apply_workflow", {
        nodes: [{ id: "prompt-1", type: "prompt", data: { prompt: PROMPT } }],
        edges: [],
      }),
    ).toEqual([{ nodeId: "prompt-1", prompt: PROMPT }]);
  });

  it("ignores non-prompt canvas writes", () => {
    expect(promptCardsFromTool("place_node", { node: { id: "iv-generator", type: "generator", data: { model: "openai" } } })).toEqual([]);
    expect(promptCardsFromTool("get_canvas_state", {})).toEqual([]);
  });
});

describe("isPromptOnlyCanvasWrite", () => {
  it("is true when the only canvas write is a prompt node", () => {
    expect(
      isPromptOnlyCanvasWrite([
        { toolName: "view_canvas_images", input: {} },
        {
          toolName: "apply_workflow",
          input: { blueprint: JSON.stringify({ nodes: [{ id: "prompt-1", type: "prompt", data: { prompt: PROMPT } }], edges: [] }) },
        },
      ]),
    ).toBe(true);
  });

  it("is false when a generator is also written", () => {
    expect(
      isPromptOnlyCanvasWrite([
        { toolName: "place_node", input: { node: { id: "iv-prompt", type: "prompt", data: { prompt: PROMPT } } } },
        { toolName: "place_node", input: { node: { id: "iv-generator", type: "generator", data: { model: "openai" } } } },
      ]),
    ).toBe(false);
  });
});

describe("mergePromptCards", () => {
  it("keeps the last prompt per node", () => {
    expect(
      mergePromptCards([
        { nodeId: "prompt-1", prompt: "v1" },
        { nodeId: "prompt-1", prompt: "v2" },
      ]),
    ).toEqual([{ nodeId: "prompt-1", prompt: "v2" }]);
  });
});
