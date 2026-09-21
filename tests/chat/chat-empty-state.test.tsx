import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ReactFlowProvider } from "@xyflow/react";
import type { UIMessage } from "ai";
import MessageList from "@/components/panels/chat/MessageList";
import type { ChatTurnControls } from "@/components/panels/chat/Message";
import { INTERVIEW_START_MESSAGE } from "@/components/panels/chat/ChatEmptyState";

const controls = (overrides: Partial<ChatTurnControls> = {}): ChatTurnControls => ({
  status: "ready",
  errorMessage: null,
  turnStartedAt: null,
  stoppedLive: false,
  liveTurnStart: null,
  onAskAgent: () => {},
  onRetry: null,
  ...overrides,
});

const list = (messages: UIMessage[], c: ChatTurnControls, surface?: "canvas" | "studio") => (
  <ReactFlowProvider>
    <MessageList messages={messages} controls={c} surface={surface} />
  </ReactFlowProvider>
);

describe("chat empty state", () => {
  it("points to slash skills, image and vocal — no start button", () => {
    const html = renderToStaticMarkup(list([], controls()));
    expect(html).toContain("On commence par quoi ?");
    expect(html).toContain("/croquis");
    expect(html).toContain("skill");
    expect(html).toContain("image");
    expect(html).toContain("vocal");
    expect(html).not.toContain("Construire avec");
    expect(html).not.toContain("Étape");
    expect(html).not.toContain("n/7");
    expect(INTERVIEW_START_MESSAGE).toBe("Aide-moi à construire la miniature de ma vidéo.");
  });

  it("on studio asks only for the video idea, never /ecrire as the path", () => {
    const html = renderToStaticMarkup(list([], controls(), "studio"));
    expect(html).toContain("On commence par quoi ?");
    expect(html).toContain("Décris l’idée de la vidéo");
    expect(html).not.toContain("/ecrire");
    expect(html).not.toContain("/croquis");
    expect(html).not.toMatch(/miniature/i);
  });

  it("is not shown once the conversation has messages", () => {
    const messages = [{ id: "u1", role: "user", parts: [{ type: "text", text: "Salut" }] }] as UIMessage[];
    expect(renderToStaticMarkup(list(messages, controls()))).not.toContain("On commence par quoi ?");
  });
});
