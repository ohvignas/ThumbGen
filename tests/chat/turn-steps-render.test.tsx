import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { UIMessage } from "ai";
import TurnSteps from "@/components/panels/chat/TurnSteps";
import ToolCallCard, { hasResultRenderer } from "@/components/panels/chat/ToolCallCard";
import { VISUAL_RESULT_TOOLS } from "@/lib/agent/finish-turn";
import { splitAssistantTurn, type ToolPart } from "@/components/panels/chat/turn-model";

function assistant(parts: unknown[]): UIMessage {
  return { id: "a1", role: "assistant", parts } as unknown as UIMessage;
}

describe("TurnSteps", () => {
  it("lists reasoning, intermediate text and tools with their status, everything folded", () => {
    const turn = splitAssistantTurn(
      assistant([
        { type: "reasoning", text: "Je réfléchis longuement." },
        { type: "text", text: "Je lis le canvas." },
        { type: "tool-get_canvas_state", toolCallId: "c1", state: "output-available", input: {}, output: { content: [{ type: "text", text: "2 nœuds" }] } },
        { type: "tool-generate_sketch", toolCallId: "c2", state: "output-available", input: { prompt: "x" }, output: { isError: true, content: [{ type: "text", text: "OpenRouter API error 500" }] } },
        { type: "tool-search_youtube", toolCallId: "c3", state: "input-available", input: { query: "macbook" } },
        { type: "text", text: "Voilà." },
      ]),
    );
    const html = renderToStaticMarkup(<TurnSteps steps={turn.steps} live={false} />);
    expect(html).toContain("group-data-[panel-open]/tool:rotate-90 motion-reduce:transition-none");
    expect(html).toContain("motion-reduce:animate-none");
    expect(html).toContain("Réflexion");
    expect(html).not.toContain("Je réfléchis longuement.");
    expect(html).toContain("Je lis le canvas.");
    expect(html).toContain("Lit le canvas");
    expect(html).toContain("(terminé)");
    expect(html).toContain("Dessine le croquis");
    expect(html).toContain("(échec)");
    expect(html).toContain("OpenRouter API error 500");
    expect(html).toContain("Cherche sur YouTube");
    expect(html).toContain("(en cours)");
    expect(html).toContain('data-slot="spinner"');
    expect(html).not.toContain("Voilà.");
    expect(html).not.toContain("Entrée");
  });

  it("says when there is no step yet", () => {
    expect(renderToStaticMarkup(<TurnSteps steps={[]} live />)).toContain("Aucune étape pour l&#x27;instant.");
  });
});

describe("ToolCallCard", () => {
  it("has a renderer for every visual result tool", () => {
    expect(VISUAL_RESULT_TOOLS.every(hasResultRenderer)).toBe(true);
    expect(hasResultRenderer("apply_workflow")).toBe(false);
    expect(hasResultRenderer("constructor")).toBe(false);
  });

  it("renders nothing for a tool without a visual output", () => {
    const part = { type: "tool-apply_workflow", toolCallId: "c1", state: "output-available", input: {}, output: { content: [] } } as unknown as ToolPart;
    expect(renderToStaticMarkup(<ToolCallCard part={part} />)).toBe("");
  });
});
