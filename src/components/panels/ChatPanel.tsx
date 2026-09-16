"use client";
import { useEffect, useMemo, useCallback, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { lastAssistantMessageIsCompleteWithClientToolCalls } from "./chat/should-auto-continue";
import { useChatStore } from "@/store/chat-store";
import { useCanvasStore } from "@/store/canvas-store";
import ChatHeader from "./chat/ChatHeader";
import AgentAvatar from "./chat/AgentAvatar";
import MessageList from "./chat/MessageList";
import Composer from "./chat/Composer";
import PendingUiAction, { PendingToolPart } from "./chat/PendingUiAction";
import AgentActivity from "./chat/AgentActivity";
import ImageAnnotateModal from "./chat/ImageAnnotateModal";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { rowsToUIMessages } from "./chat/history-to-ui-messages";

// Per-browser UI preference, so a minimised agent stays minimised on reload.
const OPEN_STORAGE_KEY = "thumbgen.chat.open";

function readStoredOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_STORAGE_KEY) !== "false";
  } catch {
    return true;
  }
}

/**
 * Right-side chat panel. Slide-in 420px wide. Mounted from Canvas.
 *
 * Lifecycle:
 *   - On open + active conversation change: fetch persisted messages
 *   - On send: @ai-sdk/react's useChat optimistically pushes the user
 *     message and opens the UI-message stream against postV2
 *     (src/lib/agent/v2/route-handler.ts, the only agent backend)
 *   - The assistant message streams in as part of useChat's own `messages`
 *     until `status` returns to "ready"
 *   - On done: refetch messages from DB to canonicalize
 *
 * NOTE: data-fetching was swapped from the old hand-rolled SSE hook
 * (src/hooks/useChat.ts) to @ai-sdk/react's useChat. MessageList/AgentActivity
 * were rewired in Tasks 5/6, Composer in Task 7, and PendingUiAction in
 * Task 11 (this is the last of those rewires — no adapter scaffolding
 * remains) to consume useChat's chatMessages/status/addToolOutput directly.
 */
export default function ChatPanel({ projectId }: { projectId: string }) {
  const [open, setOpenState] = useState(readStoredOpen);
  const setOpen = useCallback((next: boolean) => {
    setOpenState(next);
    try {
      localStorage.setItem(OPEN_STORAGE_KEY, String(next));
    } catch {
      // Storage unavailable (private mode): the choice just won't persist.
    }
  }, []);

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
    // resolved-but-idle. Scoped to client-tool completions specifically (see
    // the function's own doc comment) — ai's own
    // lastAssistantMessageIsCompleteWithToolCalls fires for ANY completed
    // tool call, which could otherwise trigger an unbounded auto-
    // continuation loop when the server's MAX_STEPS cap lands on a step that
    // happened to end with completed server-tool results.
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithClientToolCalls,
  });

  const annotateImageUrl = useChatStore((s) => s.annotateImageUrl);
  const closeAnnotate = useChatStore((s) => s.closeAnnotate);

  // When project changes, clear active conv so useConversations picks the new
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

  // The last message's pending client-tool part (request_user_image /
  // request_user_sketch) — a direct scan of chatMessages, replacing the old
  // legacyEvents-array scan. Requires state === "input-available"
  // specifically (not just "!== output-available"): the deleted
  // uiMessageToLegacyEvents adapter also excluded "input-streaming" (args
  // not settled yet — `input?.reason` would be undefined, and resolving
  // mid-stream sets state to "output-available" without ever firing the
  // auto-continuation, since sendAutomaticallyWhen's send is gated on
  // status being neither "streaming" nor "submitted" — the next
  // tool-input-available chunk then silently overwrites the resolved part).
  // "output-error"/"output-denied" are excluded too for the same reason —
  // only "input-available" is a state where offering a resolution is safe.
  const pendingToolPart = useMemo<PendingToolPart | undefined>(() => {
    const lastMessage = chatMessages.at(-1);
    return lastMessage?.role === "assistant"
      ? lastMessage.parts.find(
          (p): p is PendingToolPart =>
            (p.type === "tool-request_user_image" || p.type === "tool-request_user_sketch") &&
            p.state === "input-available",
        )
      : undefined;
  }, [chatMessages]);

  // Resolves PendingUiAction's pending part via useChat's real addToolOutput.
  // `options.body` is NOT optional: addToolOutput's auto-continuation
  // (sendAutomaticallyWhen above) goes through the SAME DefaultChatTransport
  // as a normal send, so it needs the same conversation_id/project_id/
  // canvas_snapshot or route-handler.ts's own guard 400s it (verified
  // against node_modules/ai/dist/index.js's real addToolOutput ->
  // makeRequest -> transport.sendMessages call path) — see this task's brief
  // header note.
  const respondToUiTool = useCallback(
    (toolCallId: string, result: unknown) => {
      if (!pendingToolPart) return;
      const toolName = pendingToolPart.type.slice("tool-".length) as "request_user_image" | "request_user_sketch";
      void addToolOutput({
        tool: toolName,
        toolCallId,
        output: result,
        options: {
          body: {
            conversation_id: activeConversationId,
            project_id: projectId,
            canvas_snapshot: snapshotCanvas(nodes, edges),
          },
        },
      });
    },
    [addToolOutput, pendingToolPart, activeConversationId, projectId, nodes, edges],
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

    // Cheap, idempotent, always safe to call — useConversations refetches
    // the whole list on every bump. This is how the conversation list picks
    // up an auto-generated title (route-handler.ts's generateAndPersistTitle,
    // fire-and-forget server-side on a conversation's first turn) — there's
    // no more SSE `conversation_renamed` event under v2 to trigger this
    // precisely, so bumping unconditionally after every send is the simplest
    // correct replacement. If the title write raced past this refetch, the
    // list just shows the old title until the next bump.
    useChatStore.getState().bumpConversationListVersion();
  }, [activeConversationId, projectId, draft, attachments, setDraft, clearAttachments, sendMessage, nodes, edges, setMessages]);

  const busy = status === "submitted" || status === "streaming";

  return (
    <>
      {/* Kept mounted while minimised so scroll position and any in-flight
          stream survive a minimise/reopen; `hidden` only removes it from view. */}
      <aside
        hidden={!open}
        className="fixed right-4 bottom-4 z-40 h-[min(640px,calc(100vh-2rem))] w-[400px] max-w-[calc(100vw-2rem)] origin-bottom-right animate-in fade-in zoom-in-95 duration-150"
      >
        <Card className="flex h-full flex-col gap-0 overflow-hidden py-0 shadow-2xl">
          <ChatHeader projectId={projectId} status={status} onMinimize={() => setOpen(false)} />

          <CardContent className="flex flex-1 flex-col overflow-hidden p-0">
            <MessageList messages={chatMessages} status={status} />

            {pendingToolPart && (
              <PendingUiAction part={pendingToolPart} onResolve={respondToUiTool} />
            )}

            <AgentActivity status={status} lastMessage={chatMessages.at(-1)} />

            {error && (
              <Alert variant="destructive" className="mx-3 my-2">
                <AlertTitle>Erreur</AlertTitle>
                <AlertDescription>{error.message}</AlertDescription>
              </Alert>
            )}
          </CardContent>

          <CardFooter className="p-0">
            <Composer onSend={onSend} status={status} onStop={stop} />
          </CardFooter>
        </Card>
      </aside>

      {!open && (
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                onClick={() => setOpen(true)}
                aria-label="Ouvrir l'agent"
                className="fixed right-4 bottom-4 z-40 rounded-2xl transition-transform duration-200 animate-in fade-in zoom-in-75 hover:-translate-y-0.5 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <AgentAvatar size="lg" />
                {busy && (
                  <span className="absolute -top-1 -right-1 flex size-3.5">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-violet-400 opacity-75" />
                    <span className="relative inline-flex size-3.5 rounded-full border-2 border-background bg-violet-400" />
                  </span>
                )}
              </button>
            }
          />
          <TooltipContent side="left">
            <p>{busy ? "L'agent travaille…" : "Ouvrir l'agent"}</p>
          </TooltipContent>
        </Tooltip>
      )}

      {annotateImageUrl && (
        <ImageAnnotateModal imageUrl={annotateImageUrl} onClose={closeAnnotate} />
      )}
    </>
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
