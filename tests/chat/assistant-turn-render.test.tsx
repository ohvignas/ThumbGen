import { describe, it, expect } from "vitest";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ReactFlowProvider } from "@xyflow/react";
import type { UIMessage } from "ai";
import AssistantTurn from "@/components/panels/chat/AssistantTurn";
import { rowsToUIMessages, type StoredMessageRow } from "@/components/panels/chat/history-to-ui-messages";
import { INTERRUPTED_TURN_ERROR, emptyAssistantTurn, splitAssistantTurn } from "@/components/panels/chat/turn-model";

const PNG = "iVBORw0KGgo=";
const noop = () => {};
const render = (ui: ReactNode) => renderToStaticMarkup(<ReactFlowProvider>{ui}</ReactFlowProvider>);
const count = (html: string, needle: string) => html.split(needle).length - 1;

describe("AssistantTurn — reopened conversation without finish_turn", () => {
  const rows: StoredMessageRow[] = [
    {
      id: "u1",
      role: "user",
      content_json: JSON.stringify([{ role: "user", content: [{ type: "text", text: "Des idées ?" }] }]),
      created_at: "2026-09-16 10:00:00",
      interrupted: 0,
    },
    {
      id: "a1",
      role: "assistant",
      created_at: "2026-09-16 10:00:12",
      interrupted: 0,
      content_json: JSON.stringify([
        {
          role: "assistant",
          content: [
            { type: "text", text: "Je cherche sur YouTube." },
            { type: "tool-call", toolCallId: "c1", toolName: "search_youtube", input: { query: "macbook" } },
          ],
        },
        {
          role: "tool",
          content: [
            {
              type: "tool-result",
              toolCallId: "c1",
              toolName: "search_youtube",
              output: {
                type: "content",
                value: [
                  { type: "text", text: "[1] Le MacBook — Chaîne" },
                  { type: "file", mediaType: "image/jpeg", data: { type: "data", data: PNG } },
                ],
              },
            },
          ],
        },
        { role: "assistant", content: [{ type: "text", text: "Trois patterns ressortent : visages choqués, flèches, contrastes." }] },
      ]),
    },
  ];

  it("shows the answer, the results and a folded step header", () => {
    const turn = splitAssistantTurn(rowsToUIMessages(rows)[1]);
    const html = render(<AssistantTurn turn={turn} error={null} showActions onRetry={null} onAskAgent={noop} />);
    expect(html).toContain("12 s · 2 étapes");
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("Trois patterns ressortent");
    expect(html).not.toContain("Je cherche sur YouTube.");
    expect(count(html, "<img")).toBe(1);
    expect(html).not.toContain("Et maintenant");
    expect(html).toContain('aria-label="Copier la réponse"');
  });
});

describe("AssistantTurn — finish_turn", () => {
  const sketch = (toolCallId: string) => ({
    type: "tool-generate_sketch",
    toolCallId,
    state: "output-available",
    input: { prompt: toolCallId },
    output: {
      content: [
        { type: "text", text: `Sketch generated. Reference: generated:sk_${toolCallId}` },
        { type: "image", mimeType: "image/png", data: PNG },
        { type: "text", text: `result_id: ${toolCallId}` },
      ],
    },
  });
  const message = {
    id: "a2",
    role: "assistant",
    metadata: { durationMs: 12_000 },
    parts: [
      { type: "reasoning", text: "Deux directions." },
      sketch("c1"),
      sketch("c2"),
      {
        type: "tool-finish_turn",
        toolCallId: "c3",
        state: "output-available",
        input: {
          summary: "Deux angles prêts : **A** choc, **B** duel.",
          results: ["c2", "c1", "inconnu"],
          next_actions: [
            { label: "Angle A", kind: "ask_agent", message: "Je choisis l'angle A." },
            { label: "Ancien nœud", kind: "focus_node", node_id: "supprime" },
          ],
        },
        output: { content: [{ type: "text", text: '{"ok":true}' }] },
      },
    ],
  } as unknown as UIMessage;

  it("shows the summary, both sketches and the actions of the last turn", () => {
    const html = render(<AssistantTurn turn={splitAssistantTurn(message)} error={null} showActions onRetry={null} onAskAgent={noop} />);
    expect(html).toContain("12 s · 3 étapes");
    expect(html).toContain("<strong>A</strong>");
    expect(count(html, "<img")).toBe(2);
    expect(html).toContain("Et maintenant");
    expect(html).toContain("Angle A");
    expect(html).toContain("Ancien nœud");
    // A node missing from the canvas disables its button (the found case is checked in the browser:
    // zustand renders its initial, empty canvas on the server).
    expect(count(html, 'aria-disabled="true"')).toBe(1);
  });

  it("hides the actions on an older turn", () => {
    const html = render(<AssistantTurn turn={splitAssistantTurn(message)} error={null} showActions={false} onRetry={null} onAskAgent={noop} />);
    expect(html).toContain("Deux angles prêts");
    expect(html).not.toContain("Et maintenant");
  });
});

describe("AssistantTurn — error", () => {
  it("replaces the answer with an Alert and Réessayer", () => {
    const turn = { ...emptyAssistantTurn(), answer: "Réponse partielle" };
    const html = render(<AssistantTurn turn={turn} error={INTERRUPTED_TURN_ERROR} showActions={false} onRetry={noop} onAskAgent={noop} />);
    expect(html).toContain('role="alert"');
    expect(html).toContain("Tour interrompu");
    expect(html).toContain("Réessayer");
    expect(html).not.toContain("Réponse partielle");
    expect(html).not.toContain("Copier la réponse");
  });

  it("has no Réessayer without a retry handler", () => {
    const html = render(<AssistantTurn turn={emptyAssistantTurn()} error={INTERRUPTED_TURN_ERROR} showActions={false} onRetry={null} onAskAgent={noop} />);
    expect(html).not.toContain("Réessayer");
  });
});
