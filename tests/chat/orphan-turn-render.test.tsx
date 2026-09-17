import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ReactFlowProvider } from "@xyflow/react";
import type { UIMessage } from "ai";
import MessageList from "@/components/panels/chat/MessageList";
import type { ChatTurnControls } from "@/components/panels/chat/Message";

const controls = (overrides: Partial<ChatTurnControls> = {}): ChatTurnControls => ({
  status: "ready",
  errorMessage: null,
  turnStartedAt: null,
  stoppedLive: false,
  liveTurnStart: null,
  onAskAgent: () => {},
  onRetry: () => {},
  ...overrides,
});

const messages: UIMessage[] = [{ id: "u1", role: "user", parts: [{ type: "text", text: "Fais un croquis" }] }];

const render = (c: ChatTurnControls) =>
  renderToStaticMarkup(
    <ReactFlowProvider>
      <MessageList messages={messages} controls={c} />
    </ReactFlowProvider>,
  );

describe("orphan user turn", () => {
  it("reads « Tour interrompu » with « Réessayer » under the unanswered message", () => {
    const html = render(controls({ orphanUserTurn: true }));
    expect(html).toContain("Tour interrompu");
    expect(html).toContain("Réessayer");
  });

  it("shows nothing under the message without the flag", () => {
    expect(render(controls())).not.toContain("Tour interrompu");
  });
});
