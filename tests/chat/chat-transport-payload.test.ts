import { describe, it, expect } from "vitest";
import { Chat } from "@ai-sdk/react";
import { lastAssistantMessageIsCompleteWithClientToolCalls } from "@/components/panels/chat/should-auto-continue";
import type { UIMessage } from "ai";
import { createAgentChatTransport, trimMessageForServer } from "@/components/panels/chat/chat-transport";

const bigBase64 = "A".repeat(200_000);

function recordingTransport() {
  const bodies: Record<string, unknown>[] = [];
  const transport = createAgentChatTransport({
    getConversationId: () => "conv-1",
    fetch: async (_input, init) => {
      bodies.push(JSON.parse(String(init?.body)));
      const chunks = [
        { type: "start" },
        { type: "start-step" },
        { type: "text-start", id: "t" },
        { type: "text-delta", id: "t", delta: "ok" },
        { type: "text-end", id: "t" },
        { type: "finish-step" },
        { type: "finish" },
      ];
      return new Response(chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("") + "data: [DONE]\n\n", {
        status: 200,
        headers: { "content-type": "text/event-stream", "x-vercel-ai-ui-message-stream": "v1" },
      });
    },
  });
  return { transport, bodies };
}

const heavyAssistant: UIMessage = {
  id: "a1",
  role: "assistant",
  parts: [
    { type: "text", text: "Voici un croquis." },
    {
      type: "tool-generate_sketch",
      toolCallId: "gs-1",
      state: "output-available",
      input: { prompt: "x" },
      output: { image_base64: bigBase64 },
    },
  ],
};

describe("chat transport payload", () => {
  it("sends only the last message, keeping body fields, id, trigger and messageId", async () => {
    const { transport, bodies } = recordingTransport();
    const messages: UIMessage[] = [
      { id: "u1", role: "user", parts: [{ type: "text", text: "Avant" }] },
      heavyAssistant,
      { id: "u2", role: "user", parts: [{ type: "text", text: "Nouveau" }] },
    ];
    await transport.sendMessages({
      chatId: "chat-1",
      messages,
      abortSignal: undefined,
      trigger: "submit-message",
      messageId: undefined,
      body: {
        conversation_id: "conv-1",
        project_id: "p1",
        canvas_snapshot: { nodes: [] },
        attachments: [{ type: "image", source: "stored:sf_abc" }],
      },
    });
    expect(bodies).toHaveLength(1);
    const body = bodies[0];
    expect(body).toMatchObject({
      id: "chat-1",
      conversation_id: "conv-1",
      project_id: "p1",
      canvas_snapshot: { nodes: [] },
      attachments: [{ type: "image", source: "stored:sf_abc" }],
      trigger: "submit-message",
    });
    expect(body.messages).toEqual([{ id: "u2", role: "user", parts: [{ type: "text", text: "Nouveau" }] }]);
    expect(JSON.stringify(body).length).toBeLessThan(2_000);
  });

  it("keeps the regenerate trigger", async () => {
    const { transport, bodies } = recordingTransport();
    await transport.sendMessages({
      chatId: "chat-1",
      messages: [{ id: "u1", role: "user", parts: [{ type: "text", text: "Encore" }] }],
      abortSignal: undefined,
      trigger: "regenerate-message",
      messageId: "a9",
      body: { conversation_id: "conv-1" },
    });
    expect(bodies[0]).toMatchObject({ trigger: "regenerate-message", messageId: "a9", conversation_id: "conv-1" });
  });

  it("strips file parts and heavy tool outputs from a user message", () => {
    const trimmed = trimMessageForServer({
      id: "u1",
      role: "user",
      parts: [
        { type: "file", mediaType: "image/png", url: `data:image/png;base64,${bigBase64}` },
        { type: "text", text: "Salut" },
        { type: "text", text: " toi" },
      ],
    });
    expect(trimmed).toEqual({ id: "u1", role: "user", parts: [{ type: "text", text: "Salut" }, { type: "text", text: " toi" }] });
  });

  it("keeps resolved client-tool parts of a continuation and drops everything else", () => {
    const trimmed = trimMessageForServer({
      id: "a1",
      role: "assistant",
      parts: [
        ...heavyAssistant.parts,
        { type: "step-start" },
        {
          type: "tool-request_user_image",
          toolCallId: "img-1",
          state: "output-available",
          input: { reason: "Ton logo" },
          output: { source_ids: ["stored:lg_1"] },
        },
        { type: "tool-ask_user", toolCallId: "ask-1", state: "output-error", input: {}, errorText: "raté" },
        { type: "tool-ask_user", toolCallId: "ask-2", state: "input-available", input: {} },
      ],
    });
    expect(trimmed).toEqual({
      id: "a1",
      role: "assistant",
      parts: [
        { type: "tool-request_user_image", toolCallId: "img-1", state: "output-available", output: { source_ids: ["stored:lg_1"] } },
        { type: "tool-ask_user", toolCallId: "ask-1", state: "output-error", errorText: "raté" },
      ],
    });
    expect(JSON.stringify(trimmed)).not.toContain(bigBase64.slice(0, 100));
  });

  it("sends an empty messages list when there is no message", async () => {
    const { transport, bodies } = recordingTransport();
    await transport.sendMessages({
      chatId: "chat-1",
      messages: [],
      abortSignal: undefined,
      trigger: "submit-message",
      messageId: undefined,
      body: { conversation_id: "conv-1" },
    });
    expect(bodies[0].messages).toEqual([]);
  });

  it("a client-tool answer (addToolOutput continuation) posts only the resolved part, not the heavy history", async () => {
    const { transport, bodies } = recordingTransport();
    const chat = new Chat<UIMessage>({
      transport,
      sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithClientToolCalls,
      messages: [
        { id: "u1", role: "user", parts: [{ type: "text", text: "Fais un croquis" }] },
        {
          ...heavyAssistant,
          parts: [
            ...heavyAssistant.parts,
            { type: "tool-ask_user", toolCallId: "ask-1", state: "input-available", input: { question: "Quel style ?" } },
          ],
        },
      ],
    });
    await chat.addToolOutput({
      tool: "ask_user" as never,
      toolCallId: "ask-1",
      output: { answer: "Minimal" } as never,
      options: { body: { conversation_id: "conv-1" } },
    } as never);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toMatchObject({ conversation_id: "conv-1" });
    expect(bodies[0].messages).toEqual([
      {
        id: "a1",
        role: "assistant",
        parts: [{ type: "tool-ask_user", toolCallId: "ask-1", state: "output-available", output: { answer: "Minimal" } }],
      },
    ]);
  });
});
