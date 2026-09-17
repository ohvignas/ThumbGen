import { describe, it, expect } from "vitest";
import type { UIMessage } from "ai";
import { rowsToUIMessages, type StoredMessageRow } from "@/components/panels/chat/history-to-ui-messages";
import { splitAssistantTurn, type ToolStep } from "@/components/panels/chat/turn-model";

const input = {
  question: "Quel angle ?",
  step: 2,
  options: [
    { id: "a", label: "Choc" },
    { id: "b", label: "Démo" },
  ],
};

const toolStep = (message: UIMessage) =>
  splitAssistantTurn(message).steps.find((step): step is ToolStep => step.kind === "tool" && step.toolName === "ask_user");

describe("ask_user in the folded step list", () => {
  it("shows the question and the live answer", () => {
    const message = {
      id: "m1",
      role: "assistant",
      parts: [{ type: "tool-ask_user", toolCallId: "q1", state: "output-available", input, output: { selected: ["a"] } }],
    } as unknown as UIMessage;
    expect(toolStep(message)?.label).toBe("Quel angle ? : Choc");
  });

  const rows = (output: unknown): StoredMessageRow[] => [
    {
      id: "a1",
      role: "assistant",
      interrupted: 0,
      content_json: JSON.stringify([
        { role: "assistant", content: [{ type: "tool-call", toolCallId: "q1", toolName: "ask_user", input }] },
      ]),
    },
    ...(output === undefined
      ? []
      : [
          {
            id: "a2",
            role: "assistant" as const,
            interrupted: 0,
            content_json: JSON.stringify([
              { role: "tool", content: [{ type: "tool-result", toolCallId: "q1", toolName: "ask_user", output }] },
            ]),
          },
        ]),
  ];

  it("reads the persisted json answer of a reopened conversation", () => {
    const [message] = rowsToUIMessages(rows({ type: "json", value: { selected: ["b"] } }));
    expect(toolStep(message)?.label).toBe("Quel angle ? : Démo");
  });

  it("names « Autre », « Passé » and an abandoned question", () => {
    expect(toolStep(rowsToUIMessages(rows({ type: "json", value: { other: "Tuto" } }))[0])?.label).toBe(
      "Quel angle ? : Autre : Tuto",
    );
    expect(toolStep(rowsToUIMessages(rows({ type: "json", value: { skipped: true } }))[0])?.label).toBe(
      "Quel angle ? : Passé",
    );
    expect(
      toolStep(rowsToUIMessages(rows({ type: "json", value: { skipped: true, reason: "abandoned" } }))[0])?.label,
    ).toBe("Quel angle ? : sans réponse");
  });

  it("keeps an unanswered reopened question pending", () => {
    const turn = splitAssistantTurn(rowsToUIMessages(rows(undefined))[0]);
    expect(turn.pending).toHaveLength(1);
    expect(turn.pending[0].type).toBe("tool-ask_user");
  });
});
