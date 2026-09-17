import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { UIMessage } from "ai";
import TurnProgress from "@/components/panels/chat/TurnProgress";
import { splitAssistantTurn } from "@/components/panels/chat/turn-model";

describe("TurnProgress", () => {
  it("shows one status line with the current step, a timer and a folded live detail", () => {
    const message = {
      id: "a1",
      role: "assistant",
      parts: [
        { type: "step-start" },
        { type: "text", text: "Je cherche des miniatures." },
        { type: "tool-search_youtube", toolCallId: "c1", state: "input-available", input: { query: "macbook" } },
      ],
    } as unknown as UIMessage;
    const html = renderToStaticMarkup(
      <TurnProgress message={message} status="streaming" startedAt={null} steps={splitAssistantTurn(message).steps} />,
    );
    expect(html.match(/role="status"/g)).toHaveLength(2); // the Marker and its (aria-hidden) Spinner
    expect(html).toContain("Cherche sur YouTube");
    expect(html).toContain("0:00");
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain("Je cherche des miniatures.");
  });

  it("says Réfléchit while the request is only submitted", () => {
    const html = renderToStaticMarkup(<TurnProgress message={undefined} status="submitted" startedAt={null} steps={[]} />);
    expect(html).toContain("Réfléchit");
  });
});
