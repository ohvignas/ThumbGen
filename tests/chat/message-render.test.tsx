import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ReactFlowProvider } from "@xyflow/react";
import type { UIMessage } from "ai";
import Message, { type ChatTurnControls } from "@/components/panels/chat/Message";

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

const render = (message: UIMessage, isLast: boolean, c: ChatTurnControls, showAvatar = true) =>
  renderToStaticMarkup(
    <ReactFlowProvider>
      <Message message={message} isLast={isLast} showAvatar={showAvatar} controls={c} />
    </ReactFlowProvider>,
  );

const readCanvas = { type: "tool-get_canvas_state", toolCallId: "c1", state: "output-available", input: {}, output: { content: [{ type: "text", text: "vide" }] } };

const finished = {
  id: "a1",
  role: "assistant",
  parts: [
    { type: "text", text: "Je lis le canvas." },
    readCanvas,
    {
      type: "tool-finish_turn",
      toolCallId: "c2",
      state: "output-available",
      input: { summary: "Canvas vide, on commence ?", next_actions: [{ label: "Oui, on y va", kind: "ask_agent", message: "Oui, on commence." }] },
      output: { content: [{ type: "text", text: '{"ok":true}' }] },
    },
  ],
} as unknown as UIMessage;

describe("Message", () => {
  it("keeps the user's tinted bubble", () => {
    const html = render({ id: "u1", role: "user", parts: [{ type: "text", text: "Salut" }] } as UIMessage, false, controls());
    expect(html).toContain('data-slot="bubble"');
    expect(html).toContain('data-variant="tinted"');
    expect(html).toContain("Salut");
  });

  it("shows only the live step line while the last turn runs", () => {
    const running = {
      id: "a1",
      role: "assistant",
      parts: [{ type: "text", text: "Je lis le canvas." }, { ...readCanvas, state: "input-available", output: undefined }],
    } as unknown as UIMessage;
    const html = render(running, true, controls({ status: "streaming" }));
    expect(html).toContain('role="status"');
    expect(html).toContain("Lit le canvas");
    expect(html).not.toContain("Je lis le canvas.");
  });

  it("shows the answer and « Et maintenant » on the last finished turn only", () => {
    const last = render(finished, true, controls());
    expect(last).toContain("2 étapes");
    expect(last).toContain("Canvas vide, on commence ?");
    expect(last).toContain("Et maintenant");
    expect(last).toContain("Oui, on y va");

    const older = render(finished, false, controls({ status: "streaming" }));
    expect(older).toContain("Canvas vide, on commence ?");
    expect(older).not.toContain("Et maintenant");
  });

  it("turns the last turn into an error with Réessayer", () => {
    const html = render(finished, true, controls({ status: "error", errorMessage: "Clé OpenRouter non configurée." }));
    expect(html).toContain("Erreur");
    expect(html).toContain("Clé OpenRouter non configurée.");
    expect(html).toContain("Réessayer");
    expect(html).not.toContain("Canvas vide, on commence ?");
  });

  it("leaves the avatar slot empty for earlier messages of a group", () => {
    expect(render(finished, false, controls(), true)).toContain("lucide-sparkles");
    expect(render(finished, false, controls(), false)).not.toContain("lucide-sparkles");
  });
});
