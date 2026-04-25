"use client";
import { useEffect, useState, useMemo, useCallback } from "react";
import { useChatStore } from "@/store/chat-store";
import { useChat } from "@/hooks/useChat";
import { useCanvasStore } from "@/store/canvas-store";
import ConversationList from "./chat/ConversationList";
import MessageList from "./chat/MessageList";
import Composer from "./chat/Composer";
import PendingUiAction, { UiToolRequest } from "./chat/PendingUiAction";
import AgentActivity from "./chat/AgentActivity";
import type { DisplayMessage, MessageBlock } from "./chat/Message";
import type { ChatEvent } from "@/hooks/useChat";
import UsageBadge from "./chat/UsageBadge";

/**
 * Right-side chat panel. Slide-in 420px wide. Mounted from Canvas.
 *
 * Lifecycle:
 *   - On open + active conversation change: fetch persisted messages
 *   - On send: optimistic user message + open SSE stream
 *   - SSE events flow into a "live" assistant message until done
 *   - On done: refetch messages from DB to canonicalize
 */
export default function ChatPanel({ projectId }: { projectId: string }) {
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const draft = useChatStore((s) => s.draft);
  const setDraft = useChatStore((s) => s.setDraft);
  const attachments = useChatStore((s) => s.attachments);
  const clearAttachments = useChatStore((s) => s.clearAttachments);

  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);

  const { send, stop, streaming, events, reset, respondToUiTool } = useChat();

  const [history, setHistory] = useState<DisplayMessage[]>([]);

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

  // Load persisted history when active conversation changes
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!activeConversationId) {
        if (!cancelled) {
          setHistory([]);
          reset();
        }
        return;
      }
      const rows = await fetch(`/api/agent/conversations/${activeConversationId}/messages`).then((r) => r.json()) as Array<{ id: string; role: "user" | "assistant"; content_json: string }>;
      if (!cancelled) {
        setHistory(rows.map(rowToDisplay));
        reset();
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [activeConversationId, reset]);

  // Build the live assistant message from streaming events
  const liveMessage: DisplayMessage | null = useMemo(() => {
    if (events.length === 0) return null;
    const blocks: MessageBlock[] = [];
    let textBuf = "";

    const flushText = () => {
      if (textBuf) {
        blocks.push({ type: "text", text: textBuf });
        textBuf = "";
      }
    };

    for (const e of events) {
      if (e.type === "text_delta") {
        textBuf += e.content;
      } else if (e.type === "tool_call") {
        flushText();
        blocks.push({
          type: "tool_call",
          id: e.id,
          name: e.name,
          input: e.input,
          status: "pending",
        });
      } else if (e.type === "tool_result") {
        const idx = blocks.findIndex((b) => b.type === "tool_call" && b.id === e.id);
        if (idx >= 0) {
          const cur = blocks[idx] as Extract<MessageBlock, { type: "tool_call" }>;
          blocks[idx] = { ...cur, status: "done", summary: e.summary, images: e.images };
        }
      } else if (e.type === "error") {
        flushText();
        blocks.push({ type: "text", text: `⚠ ${e.message}` });
      }
    }
    flushText();
    return { id: "live", role: "assistant", blocks };
  }, [events]);

  const messages = liveMessage ? [...history, liveMessage] : history;

  const pendingUiRequest = useMemo<UiToolRequest | null>(() => {
    const requests = events.filter((e) => e.type === "ui_tool_request");
    if (requests.length === 0) return null;
    const last = requests[requests.length - 1] as Extract<ChatEvent, { type: "ui_tool_request" }>;
    const acked = events.some(
      (e) => e.type === "ui_tool_response_ack" && (e as { id: string }).id === last.id,
    );
    if (acked) return null;
    return {
      id: last.id,
      name: last.name as "request_user_image" | "request_user_sketch",
      input: last.input as { reason?: string; suggested_kind?: string; initial_image_id?: string },
    };
  }, [events]);

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
    const atts = attachments.map((a) => ({ type: "image" as const, source: a.source }));

    // Optimistic user message in history
    const userBlocks: MessageBlock[] = [
      ...(text ? [{ type: "text" as const, text }] : []),
      ...attachments.map((a) => ({ type: "image" as const, preview_url: a.preview_url })),
    ];
    setHistory((h) => [
      ...h,
      { id: `local-${Date.now()}`, role: "user", blocks: userBlocks },
    ]);

    setDraft("");
    clearAttachments();

    // Send and stream
    await send({
      conversation_id: convId,
      project_id: projectId,
      message: { text, attachments: atts },
      canvas_snapshot: snapshotCanvas(nodes, edges),
    });

    // Refetch persisted history (canonical assistant message replaces the live one).
    // If the user switched conversations mid-stream, the active conv has changed —
    // discard the refetch so we don't paint old messages over the new conv's UI.
    const rows = await fetch(`/api/agent/conversations/${convId}/messages`).then((r) => r.json());
    if (useChatStore.getState().activeConversationId !== convId) return;
    setHistory((rows as Array<{ id: string; role: "user" | "assistant"; content_json: string }>).map(rowToDisplay));
    reset();
  }, [activeConversationId, projectId, draft, attachments, setDraft, clearAttachments, send, nodes, edges, reset]);

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

      <MessageList messages={messages} />

      {pendingUiRequest && (
        <PendingUiAction
          request={pendingUiRequest}
          onResolve={(id, result) => respondToUiTool(id, result)}
        />
      )}

      <AgentActivity events={events} streaming={streaming} />

      <Composer onSend={onSend} streaming={streaming} onStop={stop} />
    </aside>
  );
}

// --- Helpers ---

type AnthropicBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: unknown };

function rowToDisplay(row: {
  id: string;
  role: "user" | "assistant";
  content_json: string;
}): DisplayMessage {
  let blocks: AnthropicBlock[] = [];
  try {
    blocks = JSON.parse(row.content_json) as AnthropicBlock[];
  } catch {
    blocks = [];
  }
  const display: MessageBlock[] = [];
  for (const b of blocks) {
    if (b.type === "text") display.push({ type: "text", text: b.text });
    else if (b.type === "image") {
      display.push({
        type: "image",
        preview_url: `data:${b.source.media_type};base64,${b.source.data}`,
      });
    } else if (b.type === "tool_use") {
      display.push({
        type: "tool_call",
        id: b.id,
        name: b.name,
        input: b.input,
        status: "done",
      });
    }
    // tool_result blocks are responses to assistant tool_use; we don't display them separately
    // (they're part of the user role message in Anthropic format but represent tool output)
  }
  return { id: row.id, role: row.role, blocks: display };
}

function snapshotCanvas(nodes: Array<{ id: string; type?: string; data?: Record<string, unknown> }>, edges: Array<{ source: string; target: string; targetHandle?: string }>): unknown {
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
