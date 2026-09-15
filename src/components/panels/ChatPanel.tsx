"use client";
import { useEffect, useMemo, useCallback, useRef } from "react";
import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithToolCalls,
  isToolUIPart,
  getToolName,
  type UIMessage,
} from "ai";
import { useChatStore } from "@/store/chat-store";
import { useCanvasStore } from "@/store/canvas-store";
import ConversationList from "./chat/ConversationList";
import MessageList from "./chat/MessageList";
import Composer from "./chat/Composer";
import PendingUiAction, { UiToolRequest } from "./chat/PendingUiAction";
import AgentActivity from "./chat/AgentActivity";
import ImageAnnotateModal from "./chat/ImageAnnotateModal";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import type { ChatEvent } from "@/hooks/useChat";
import UsageBadge from "./chat/UsageBadge";
import { rowsToUIMessages } from "./chat/history-to-ui-messages";

/**
 * Right-side chat panel. Slide-in 420px wide. Mounted from Canvas.
 *
 * Lifecycle:
 *   - On open + active conversation change: fetch persisted messages
 *   - On send: @ai-sdk/react's useChat optimistically pushes the user
 *     message and opens the UI-message stream against postV2
 *     (src/lib/agent/v2/route-handler.ts, gated by THUMBGEN_AGENT_V2)
 *   - The assistant message streams in as part of useChat's own `messages`
 *     until `status` returns to "ready"
 *   - On done: refetch messages from DB to canonicalize
 *
 * NOTE: data-fetching was swapped from the old hand-rolled SSE hook
 * (src/hooks/useChat.ts) to @ai-sdk/react's useChat. MessageList/AgentActivity
 * were rewired in Tasks 5/6 and Composer in Task 7 to consume useChat's
 * chatMessages/status directly. PendingUiAction still expects the OLD
 * ChatEvent[] shape (it's rewritten in Task 11), so the `legacyEvents`/
 * `uiMessageToLegacyEvents` adapter below (marked TODO(Task 11)) stays in
 * place solely to feed `pendingUiRequest`/`respondToUiTool` until then.
 */
export default function ChatPanel({ projectId }: { projectId: string }) {
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const draft = useChatStore((s) => s.draft);
  const setDraft = useChatStore((s) => s.setDraft);
  const attachments = useChatStore((s) => s.attachments);
  const clearAttachments = useChatStore((s) => s.clearAttachments);

  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);

  const {
    messages: chatMessages,
    status,
    sendMessage,
    stop,
    addToolOutput,
    setMessages,
    error,
  } = useChat({
    // Starts empty; the "Load persisted history" useEffect below seeds this
    // via setMessages(rowsToUIMessages(rows)) as soon as activeConversationId
    // is known (including on first mount), so the initial [] here is only
    // ever visible for a single render before that effect runs.
    messages: [],
    transport: new DefaultChatTransport({ api: "/api/agent/chat" }),
    // Auto-resumes the turn once a client tool (request_user_image) has been
    // resolved via addToolOutput — needed for Task 11's human-in-the-loop
    // flow to actually continue the conversation instead of sitting
    // resolved-but-idle.
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
  });

  const bumpConversationListVersion = useChatStore((s) => s.bumpConversationListVersion);
  const annotateImageUrl = useChatStore((s) => s.annotateImageUrl);
  const closeAnnotate = useChatStore((s) => s.closeAnnotate);

  // TODO(Task 11): remove once PendingUiAction is rewritten to consume
  // useChat's UIMessage[]/ChatStatus directly. It maps this-session live
  // messages (chatMessages) back into the OLD ChatEvent[] shape that child
  // (still unmodified) expects. MessageList/AgentActivity/Composer were
  // rewired to consume chatMessages/status directly in Tasks 5/6/7.
  const legacyEvents: ChatEvent[] = useMemo(
    () => chatMessages.flatMap(uiMessageToLegacyEvents),
    [chatMessages],
  );

  // When the agent emits a `conversation_renamed` event (auto-titled first
  // turn), nudge the conversation list to refetch so the user sees the new
  // title without a manual reload. We use a ref to track the seen ones
  // since legacyEvents accumulates.
  // NOTE: v2 (postV2) does not currently emit anything that maps to
  // `conversation_renamed` via the adapter below, so this effect is
  // presently a no-op under THUMBGEN_AGENT_V2=1 — kept as-is (untouched
  // JSX/behavior) since wiring that up is out of this task's scope.
  const seenRenameRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const e of legacyEvents) {
      if (e.type !== "conversation_renamed") continue;
      const key = `${e.conversation_id}:${e.title}`;
      if (seenRenameRef.current.has(key)) continue;
      seenRenameRef.current.add(key);
      bumpConversationListVersion();
    }
  }, [legacyEvents, bumpConversationListVersion]);

  // When project changes, clear active conv so ConversationList picks the new
  // project's first conv (or stays empty if none). Without this, the previous
  // project's conversation + history would bleed over into the new project.
  useEffect(() => {
    useChatStore.getState().setActive(null);
  }, [projectId]);

  // NOTE: auto-backfill of existing untagged faces was removed at the user's
  // request (their 7 historical photos stay untagged). Only NEW uploads via
  // POST /api/face-reactions are auto-tagged. The backfill endpoint
  // /api/face-reactions/analyze-untagged is still available if anyone wants
  // to retro-tag manually (e.g. via curl or a future UI button).

  // Load persisted history when active conversation changes, seeding
  // useChat's own message state directly via rowsToUIMessages (Task 4) —
  // this replaces the old history/setHistory adapter + rowToDisplay, which
  // parsed content_json as the stale v1 AnthropicBlock[] shape and rendered
  // every persisted message as an empty bubble now that Task 2's migration
  // has moved the DB to ModelMessage[]-shaped rows.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!activeConversationId) {
        if (!cancelled) setMessages([]);
        return;
      }
      const rows = await fetch(`/api/agent/conversations/${activeConversationId}/messages`).then((r) => r.json()) as Array<{ id: string; role: "user" | "assistant"; content_json: string }>;
      if (!cancelled) setMessages(rowsToUIMessages(rows));
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [activeConversationId, setMessages]);

  const pendingUiRequest = useMemo<UiToolRequest | null>(() => {
    const requests = legacyEvents.filter((e) => e.type === "ui_tool_request");
    if (requests.length === 0) return null;
    const last = requests[requests.length - 1] as Extract<ChatEvent, { type: "ui_tool_request" }>;
    const acked = legacyEvents.some(
      (e) => e.type === "ui_tool_response_ack" && (e as { id: string }).id === last.id,
    );
    if (acked) return null;
    return {
      id: last.id,
      name: last.name as "request_user_image" | "request_user_sketch",
      input: last.input as { reason?: string; suggested_kind?: string; initial_image_id?: string },
    };
  }, [legacyEvents]);

  // TODO(Task 5-11): remove — bridges PendingUiAction's legacy
  // (toolUseId, result) callback onto useChat's real addToolOutput, which
  // needs the tool name (not just the call id) to resolve the right part.
  const respondToUiTool = useCallback(
    (toolCallId: string, result: unknown) => {
      if (!pendingUiRequest) return;
      void addToolOutput({ tool: pendingUiRequest.name, toolCallId, output: result });
    },
    [addToolOutput, pendingUiRequest],
  );

  const onSend = useCallback(async () => {
    // Auto-create a conversation if none active, then proceed with the send
    // in the same click (vs returning early which would force a second click).
    let convId = activeConversationId;
    if (!convId) {
      const r = await fetch("/api/agent/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId }),
      });
      if (!r.ok) return;
      const conv = (await r.json()) as { id: string };
      useChatStore.getState().setActive(conv.id);
      convId = conv.id;
    }

    const text = draft;

    setDraft("");
    clearAttachments();

    // useChat's sendMessage pushes the user's UIMessage into `chatMessages`
    // synchronously before the network call resolves (AbstractChat.sendMessage
    // in ai/dist/index.js calls state.pushMessage then awaits makeRequest), so
    // — unlike the old hook — no manual optimistic append into `history` is
    // needed here.
    //
    // Attachments deliberately do NOT go through AI SDK's own `files`/
    // FileUIPart mechanism (Plan 2's Task 7 decision keeps AttachButton.tsx's
    // existing `stored:<id>` string flow) — they're sent as a sibling
    // top-level `attachments` field in `body`, read by route-handler.ts.
    await sendMessage(
      { text },
      {
        body: {
          conversation_id: convId,
          project_id: projectId,
          canvas_snapshot: snapshotCanvas(nodes, edges),
          attachments: attachments.map((a) => ({ type: "image" as const, source: a.source })),
        },
      },
    );

    // Refetch persisted history (canonical assistant message replaces the live one).
    // If the user switched conversations mid-stream, the active conv has changed —
    // discard the refetch so we don't paint old messages over the new conv's UI.
    const rows = await fetch(`/api/agent/conversations/${convId}/messages`).then((r) => r.json());
    if (useChatStore.getState().activeConversationId !== convId) return;
    setMessages(rowsToUIMessages(rows as Array<{ id: string; role: "user" | "assistant"; content_json: string }>));
  }, [activeConversationId, projectId, draft, attachments, setDraft, clearAttachments, sendMessage, nodes, edges, setMessages]);

  return (
    <aside
      className="fixed right-0 top-0 bottom-0 w-[420px] flex flex-col z-40"
      style={{
        background: "var(--node-bg)",
        borderLeft: "1px solid var(--line)",
      }}
    >
      <header
        className="px-4 py-3 flex items-center justify-between gap-3"
        style={{ borderBottom: "1px solid var(--line-faint)" }}
      >
        <div className="flex items-baseline gap-2 min-w-0">
          <span
            className="text-[9px] uppercase shrink-0"
            style={{
              color: "var(--text-muted)",
              fontFamily: "var(--font-mono), 'JetBrains Mono', monospace",
              letterSpacing: "0.22em",
            }}
          >
            <span style={{ color: "var(--brand)" }}>·</span> Agent
          </span>
          <h2
            className="italic truncate"
            style={{
              color: "var(--text-primary)",
              fontFamily: "var(--font-display), 'Fraunces', serif",
              fontSize: 18,
              fontWeight: 400,
              letterSpacing: "-0.015em",
            }}
          >
            Brainstorm
          </h2>
        </div>
        <UsageBadge />
      </header>

      <ConversationList projectId={projectId} />

      <MessageList messages={chatMessages} status={status} />

      {pendingUiRequest && (
        <PendingUiAction
          request={pendingUiRequest}
          onResolve={(id, result) => respondToUiTool(id, result)}
        />
      )}

      <AgentActivity status={status} lastMessage={chatMessages.at(-1)} />

      {error && (
        <Alert variant="destructive" className="mx-3 my-2">
          <AlertTitle>Erreur</AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )}

      <Composer onSend={onSend} status={status} onStop={stop} />

      {annotateImageUrl && (
        <ImageAnnotateModal imageUrl={annotateImageUrl} onClose={closeAnnotate} />
      )}
    </aside>
  );
}

// --- Helpers ---

function snapshotCanvas(nodes: Array<{ id: string; type?: string; data?: Record<string, unknown> }>, edges: Array<{ source: string; target: string; targetHandle?: string | null }>): unknown {
  return {
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.type,
      summary: summarizeNode(n.type ?? "", n.data ?? {}),
    })),
    edges: edges.map((e) => ({ source: e.source, target: e.target, targetHandle: e.targetHandle })),
  };
}

function summarizeNode(type: string, data: Record<string, unknown>): Record<string, unknown> {
  switch (type) {
    case "prompt":
      return { prompt: data.prompt, negativePrompt: data.negativePrompt };
    case "generator":
      // Generator nodes use `count` — `numImages` was a documentation error.
      return { model: data.model, aspectRatio: data.aspectRatio, count: data.count ?? data.numImages };
    case "faceReference":
    case "swipeFile":
    case "sketch":
      return {
        hasImage: Boolean(data.imageBase64 || data.imageUrl),
        label: data.label,
      };
    default:
      return {};
  }
}

// TODO(Task 11): remove everything below — temporary UIMessage -> legacy
// ChatEvent[] adapter kept only so the untouched PendingUiAction child
// component keeps working against @ai-sdk/react's useChat output until it's
// rewritten.

/** Client tools resolved via addToolOutput from the browser (Plan 2's UI-tool
 * mechanism), matching PendingUiAction's UiToolRequest["name"] union. */
const CLIENT_UI_TOOL_NAMES = new Set(["request_user_image", "request_user_sketch"]);

function uiMessageToLegacyEvents(m: UIMessage): ChatEvent[] {
  const out: ChatEvent[] = [];
  for (const part of m.parts) {
    if (part.type === "text") {
      if (part.text) out.push({ type: "text_delta", content: part.text });
      continue;
    }
    if (!isToolUIPart(part)) continue;
    if (part.state === "input-streaming") continue; // input not settled yet

    const name = getToolName(part);
    const input = part.input;

    if (CLIENT_UI_TOOL_NAMES.has(name)) {
      out.push({ type: "ui_tool_request", id: part.toolCallId, name, input });
      if (part.state === "output-available" || part.state === "output-error" || part.state === "output-denied") {
        out.push({ type: "ui_tool_response_ack", id: part.toolCallId });
      }
      continue;
    }

    out.push({ type: "tool_call", id: part.toolCallId, name, input, scope: "server" });
    if (part.state === "output-available") {
      const output = part.output as { summary?: string; images?: string[] } | undefined;
      out.push({
        type: "tool_result",
        id: part.toolCallId,
        name,
        summary: typeof output?.summary === "string" ? output.summary : "",
        images: output?.images,
      });
    } else if (part.state === "output-error" || part.state === "output-denied") {
      out.push({
        type: "tool_result",
        id: part.toolCallId,
        name,
        summary: part.state === "output-error" ? part.errorText : "refusé",
      });
    }
  }
  return out;
}
