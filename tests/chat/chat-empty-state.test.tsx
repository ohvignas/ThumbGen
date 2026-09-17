// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { ReactFlowProvider } from "@xyflow/react";
import type { UIMessage } from "ai";
import MessageList from "@/components/panels/chat/MessageList";
import type { ChatTurnControls } from "@/components/panels/chat/Message";
import { INTERVIEW_START_MESSAGE } from "@/components/panels/chat/ChatEmptyState";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

const list = (messages: UIMessage[], c: ChatTurnControls) => (
  <ReactFlowProvider>
    <MessageList messages={messages} controls={c} />
  </ReactFlowProvider>
);

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("chat empty state — Construire avec l'agent", () => {
  it("keeps the existing copy and adds the start button", () => {
    const html = renderToStaticMarkup(list([], controls()));
    expect(html).toContain("On commence par quoi ?");
    expect(html).toContain("Construire avec l&#x27;agent");
    expect(INTERVIEW_START_MESSAGE).toBe("Aide-moi à construire la miniature de ma vidéo.");
  });

  it("sends the start message once per click", async () => {
    const onAskAgent = vi.fn();
    await act(async () => root.render(list([], controls({ onAskAgent }))));
    const button = Array.from(container.querySelectorAll("button")).find((el) => el.textContent?.includes("Construire avec l'agent"));
    expect(button).toBeDefined();
    expect(onAskAgent).not.toHaveBeenCalled();
    await act(async () => button!.click());
    expect(onAskAgent).toHaveBeenCalledTimes(1);
    expect(onAskAgent).toHaveBeenCalledWith(INTERVIEW_START_MESSAGE);
  });

  it("is not shown once the conversation has messages", () => {
    const messages = [{ id: "u1", role: "user", parts: [{ type: "text", text: "Salut" }] }] as UIMessage[];
    expect(renderToStaticMarkup(list(messages, controls()))).not.toContain("Construire avec");
  });
});
