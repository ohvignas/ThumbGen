import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ReactFlowProvider } from "@xyflow/react";
import type { UIMessage } from "ai";
import MessageList from "@/components/panels/chat/MessageList";
import type { ChatTurnControls } from "@/components/panels/chat/Message";
import { liveTurnStart } from "@/components/panels/chat/chat-view-model";

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

const render = (messages: UIMessage[], c: ChatTurnControls) =>
  renderToStaticMarkup(
    <ReactFlowProvider>
      <MessageList messages={messages} controls={c} />
    </ReactFlowProvider>,
  );

const EMPTY_TITLE = "On commence par quoi ?";

describe("MessageList", () => {
  it("shows the empty state when there is nothing going on", () => {
    expect(render([], controls())).toContain(EMPTY_TITLE);
  });

  it("shows the error of a first send instead of the empty state (I1)", () => {
    const html = render([], controls({ status: "error", errorMessage: "Clé OpenRouter non configurée." }));
    expect(html).not.toContain(EMPTY_TITLE);
    expect(html).toContain('role="alert"');
    expect(html).toContain("Clé OpenRouter non configurée.");
    expect(html).toContain("Réessayer");
  });

  it("shows the live line of a first send instead of the empty state (I1)", () => {
    const html = render([], controls({ status: "submitted" }));
    expect(html).not.toContain(EMPTY_TITLE);
    expect(html).toContain("Réfléchit");
    expect(html).toContain('aria-live="polite"');
  });

  it("puts « Tour interrompu » after an older turn instead of on it when the stop came first (I3)", () => {
    const older = [
      { id: "u0", role: "user", parts: [{ type: "text", text: "Salut" }] },
      { id: "a0", role: "assistant", parts: [{ type: "text", text: "Réponse précédente" }] },
    ] as unknown as UIMessage[];
    const html = render(older, controls({ stoppedLive: true, liveTurnStart: liveTurnStart(older) }));
    expect(html).toContain("Réponse précédente");
    expect(html).toContain("Tour interrompu");
    expect(html.indexOf("Réponse précédente")).toBeLessThan(html.indexOf("Tour interrompu"));
    // The trailing row can't retry: that would replay the older message.
    expect(html).not.toContain("Réessayer");
  });

  it("does not mark user turns as scroll anchors (those pin the last send to the top)", () => {
    const html = render(
      [
        { id: "u0", role: "user", parts: [{ type: "text", text: "Salut" }] },
        { id: "a0", role: "assistant", parts: [{ type: "text", text: "Réponse" }] },
      ] as unknown as UIMessage[],
      controls(),
    );
    expect(html).toContain('data-message-id="u0"');
    expect(html).not.toContain('data-scroll-anchor="true"');
  });
});
