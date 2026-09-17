import { describe, it, expect, vi } from "vitest";
import { Chat } from "@ai-sdk/react";
import type { UIMessage, UIMessageChunk } from "ai";
import { agentStreamUrl, createAgentChatTransport, stopAgentRun } from "@/components/panels/chat/chat-transport";
import {
  isAgentBusyError,
  isOrphanUserTurn,
  resumeWithoutStreamOutcome,
  stopFollowUp,
  withoutTrailingUserMessage,
} from "@/components/panels/chat/resume-model";
import { groupConsecutiveMessages, trailingAssistantRow } from "@/components/panels/chat/chat-view-model";
import { lastAssistantMessageIsCompleteWithClientToolCalls } from "@/components/panels/chat/should-auto-continue";
import { AGENT_BUSY_MESSAGE, type AgentRunsSnapshot } from "@/lib/agent/v2/run-types";

const sse = (chunks: UIMessageChunk[]) =>
  new Response(chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("") + "data: [DONE]\n\n", {
    status: 200,
    headers: { "content-type": "text/event-stream", "x-vercel-ai-ui-message-stream": "v1" },
  });
const msg = (id: string, role: UIMessage["role"], text = "x"): UIMessage => ({ id, role, parts: [{ type: "text", text }] });
const noRuns: AgentRunsSnapshot = { running: [], attention: [] };

/** A chat whose every request is recorded; GETs replay `chunks`, POSTs would start a paid turn. */
function recordingChat(initial: UIMessage[], chunks: UIMessageChunk[]) {
  const requests: string[] = [];
  const chat = new Chat<UIMessage>({
    messages: initial,
    transport: createAgentChatTransport({
      getConversationId: () => "conv-1",
      fetch: async (input, init) => {
        requests.push(`${init?.method ?? "GET"} ${String(input)}`);
        return sse(chunks);
      },
    }),
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithClientToolCalls,
  });
  return { chat, requests };
}

describe("agent chat transport", () => {
  it("reconnects with a GET to the active conversation's stream and reads 204 as no run", async () => {
    const calls: string[] = [];
    const statuses: number[] = [];
    const transport = createAgentChatTransport({
      getConversationId: () => "conv-1",
      onReconnectStatus: (status) => statuses.push(status),
      fetch: async (input, init) => {
        calls.push(`${init?.method ?? "GET"} ${String(input)}`);
        return new Response(null, { status: 204 });
      },
    });
    expect(await transport.reconnectToStream({ chatId: "local-chat-id" })).toBeNull();
    expect(calls).toEqual(["GET /api/agent/chat/conv-1/stream"]);
    expect(statuses).toEqual([204]);
    expect(agentStreamUrl(null)).toBe("/api/agent/chat/none/stream");
  });

  it("replays a turn paused on an image request without sending anything (no automatic model call)", async () => {
    const { chat, requests } = recordingChat([msg("u1", "user", "Ajoute mon logo")], [
      { type: "start" },
      { type: "start-step" },
      { type: "text-start", id: "t" },
      { type: "text-delta", id: "t", delta: "Il me faut ton logo." },
      { type: "text-end", id: "t" },
      { type: "tool-input-available", toolCallId: "req-1", toolName: "request_user_image", input: { reason: "Ton logo" } },
      { type: "finish-step" },
      { type: "finish" },
    ]);
    await chat.resumeStream();
    expect(requests).toEqual(["GET /api/agent/chat/conv-1/stream"]);
    expect(chat.status).toBe("ready");
    expect(chat.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(chat.messages[1].parts.some((p) => p.type === "tool-request_user_image" && "state" in p && p.state === "input-available")).toBe(true);
  });

  it("replays a continuation turn as a new assistant message, grouped with the previous one, still without sending", async () => {
    const { chat, requests } = recordingChat([msg("u1", "user"), msg("a1", "assistant", "Avant la demande")], [
      { type: "start" },
      { type: "start-step" },
      { type: "tool-input-available", toolCallId: "s1", toolName: "get_canvas_state", input: { project_id: "p" } },
      { type: "tool-output-available", toolCallId: "s1", output: { content: [{ type: "text", text: "{}" }] } },
      { type: "finish-step" },
      { type: "finish" },
    ]);
    await chat.resumeStream();
    expect(requests).toHaveLength(1);
    expect(chat.messages.map((m) => m.role)).toEqual(["user", "assistant", "assistant"]);
    expect(chat.messages[2].id).not.toBe("a1");
    expect(groupConsecutiveMessages(chat.messages).map((group) => group.messages.length)).toEqual([1, 2]);
  });

  it("asks the server to stop with a JSON POST and reports the outcome", async () => {
    const fetchMock = vi.fn(async (..._args: unknown[]) => Response.json({ stopped: true }));
    expect(await stopAgentRun("conv-1", fetchMock as unknown as typeof fetch)).toBe("stopped");
    expect(fetchMock).toHaveBeenCalledWith("/api/agent/chat/conv-1/stop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(await stopAgentRun("conv-1", (async () => Response.json({ stopped: false })) as typeof fetch)).toBe("not-running");
    expect(await stopAgentRun("conv-1", (async () => new Response("", { status: 500 })) as typeof fetch)).toBe("failed");
    expect(await stopAgentRun("conv-1", (async () => { throw new TypeError("fetch failed"); }) as typeof fetch)).toBe("failed");
  });
});

describe("resume model", () => {
  it("recognizes the 409 of a busy conversation", () => {
    expect(isAgentBusyError(new Error(AGENT_BUSY_MESSAGE))).toBe(true);
    expect(isAgentBusyError(new Error("Clé OpenRouter non configurée."))).toBe(false);
    expect(isAgentBusyError(undefined)).toBe(false);
  });

  it("drops the optimistic user message only", () => {
    const history = [msg("u0", "user"), msg("a0", "assistant")];
    expect(withoutTrailingUserMessage([...history, msg("u1", "user")])).toEqual(history);
    expect(withoutTrailingUserMessage(history)).toBe(history);
  });

  it("refetches after a 204 when the turn was running or is listed now", () => {
    expect(resumeWithoutStreamOutcome({ conversationId: "c1", listedRunningBefore: true, runsNow: noRuns })).toEqual({ refetch: true, runningNow: false });
    const ended: AgentRunsSnapshot = { running: [], attention: [{ conversationId: "c1", projectId: "p", projectName: "P", kind: "finished", endedAt: 2 }] };
    expect(resumeWithoutStreamOutcome({ conversationId: "c1", listedRunningBefore: false, runsNow: ended })).toEqual({ refetch: true, runningNow: false });
    const running: AgentRunsSnapshot = { running: [{ conversationId: "c1", projectId: "p", projectName: "P", startedAt: 1 }], attention: [] };
    expect(resumeWithoutStreamOutcome({ conversationId: "c1", listedRunningBefore: false, runsNow: running })).toEqual({ refetch: true, runningNow: true });
    expect(resumeWithoutStreamOutcome({ conversationId: "c1", listedRunningBefore: false, runsNow: noRuns })).toEqual({ refetch: false, runningNow: false });
  });

  it("an unanswered user message with no running turn is an interrupted turn (e.g. after a restart)", () => {
    expect(isOrphanUserTurn([msg("u0", "user")], false)).toBe(true);
    expect(isOrphanUserTurn([msg("u0", "user")], true)).toBe(false);
    expect(isOrphanUserTurn([msg("u0", "user"), msg("a0", "assistant")], false)).toBe(false);
    expect(isOrphanUserTurn([], false)).toBe(false);
  });

  it("shows « Tour interrompu » after an orphan user message, never while busy or on an empty list", () => {
    const orphan = [msg("u0", "user")];
    expect(trailingAssistantRow(orphan, "ready", null, true)).toBe("interrupted");
    expect(trailingAssistantRow(orphan, "ready", null)).toBeNull();
    expect(trailingAssistantRow(orphan, "submitted", null, true)).toBe("progress");
    expect(trailingAssistantRow([], "ready", null, true)).toBeNull();
    expect(trailingAssistantRow([...orphan, msg("a0", "assistant")], "ready", null, true)).toBeNull();
  });

  it("decides what « Arrêter » does after the stop route answered", () => {
    // The route could not reach the server: drop the local stream at once.
    expect(stopFollowUp({ result: "failed", status: "streaming", retried: false })).toBe("local-stop");
    expect(stopFollowUp({ result: "failed", status: "streaming", retried: true })).toBe("local-stop");
    // Stopped: the stream ends by itself.
    expect(stopFollowUp({ result: "stopped", status: "streaming", retried: false })).toBe("none");
    // Not running yet while the request is still submitted: re-sent at the first chunk.
    expect(stopFollowUp({ result: "not-running", status: "submitted", retried: false })).toBe("retry-when-streaming");
    // Already streaming (the run registered meanwhile): re-sent right away, once.
    expect(stopFollowUp({ result: "not-running", status: "streaming", retried: false })).toBe("retry-now");
    expect(stopFollowUp({ result: "not-running", status: "streaming", retried: true })).toBe("none");
    // Turn over: nothing to do.
    expect(stopFollowUp({ result: "not-running", status: "ready", retried: false })).toBe("none");
  });
});
