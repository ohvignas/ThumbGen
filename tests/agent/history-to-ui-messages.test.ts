import { describe, it, expect } from "vitest";
import { rowsToUIMessages } from "@/components/panels/chat/history-to-ui-messages";

describe("rowsToUIMessages", () => {
  it("converts a plain text turn", () => {
    const rows = [
      { id: "r1", role: "user" as const, content_json: JSON.stringify([{ role: "user", content: [{ type: "text", text: "Salut" }] }]) },
      { id: "r2", role: "assistant" as const, content_json: JSON.stringify([{ role: "assistant", content: [{ type: "text", text: "Bonjour" }] }]) },
    ];
    const messages = rowsToUIMessages(rows);
    expect(messages).toHaveLength(2);
    expect(messages[0].parts).toEqual([{ type: "text", text: "Salut" }]);
    expect(messages[1].parts).toEqual([{ type: "text", text: "Bonjour" }]);
  });

  it("folds a tool-result row back onto the matching tool-call part", () => {
    const rows = [
      { id: "r1", role: "user" as const, content_json: JSON.stringify([{ role: "user", content: [{ type: "text", text: "logos?" }] }]) },
      {
        id: "r2",
        role: "assistant" as const,
        content_json: JSON.stringify([
          { role: "assistant", content: [{ type: "tool-call", toolCallId: "c1", toolName: "list_logos", input: {} }] },
          { role: "tool", content: [{ type: "tool-result", toolCallId: "c1", toolName: "list_logos", output: { content: [{ type: "text", text: "2 logos" }] } }] },
        ]),
      },
    ];
    const messages = rowsToUIMessages(rows);
    const toolPart = messages[1].parts.find((p) => p.type === "tool-list_logos") as { state: string; output: unknown };
    expect(toolPart.state).toBe("output-available");
    expect(toolPart.output).toEqual({ content: [{ type: "text", text: "2 logos" }] });
  });

  it("rebuilds a data: URI for a file part from the persisted bare base64 string", () => {
    const rows = [
      {
        id: "r1",
        role: "user" as const,
        content_json: JSON.stringify([
          { role: "user", content: [{ type: "text", text: "voici" }, { type: "file", mediaType: "image/png", data: "iVBORw0KGgo=" }] },
        ]),
      },
    ];
    const messages = rowsToUIMessages(rows);
    const filePart = messages[0].parts.find((p) => p.type === "file") as { mediaType: string; url: string };
    expect(filePart.url).toBe("data:image/png;base64,iVBORw0KGgo=");
  });

  it("carries a reasoning part through as a UIMessage reasoning part", () => {
    const rows = [
      {
        id: "r1",
        role: "assistant" as const,
        content_json: JSON.stringify([
          { role: "assistant", content: [{ type: "reasoning", text: "thinking..." }, { type: "text", text: "done" }] },
        ]),
      },
    ];
    const messages = rowsToUIMessages(rows);
    expect(messages[0].parts).toEqual([
      { type: "reasoning", text: "thinking..." },
      { type: "text", text: "done" },
    ]);
  });
});
