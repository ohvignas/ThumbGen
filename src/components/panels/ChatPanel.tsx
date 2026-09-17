"use client";
import { useEffect, useMemo, useCallback, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { lastAssistantMessageIsCompleteWithClientToolCalls } from "./chat/should-auto-continue";
import { useChatStore, type ChatAttachment } from "@/store/chat-store";
import { useCanvasStore } from "@/store/canvas-store";
import ChatHeader from "./chat/ChatHeader";
import AgentAvatar from "./chat/AgentAvatar";
import MessageList from "./chat/MessageList";
import Composer from "./chat/Composer";
import PendingUiAction, { PendingToolPart } from "./chat/PendingUiAction";
import ImageAnnotateModal from "./chat/ImageAnnotateModal";
import type { ChatTurnControls } from "./chat/Message";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { rowsToUIMessages, type StoredMessageRow } from "./chat/history-to-ui-messages";
import { snapshotCanvas } from "./chat/canvas-snapshot";
import { lastUserText } from "./chat/chat-view-model";
import { isBusyStatus } from "./chat/turn-model";

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
 *     until `status` returns to "ready"; MessageList shows it as one live
 *     step line (TurnProgress), then as a finished turn (AssistantTurn)
 *   - On done: refetch messages from DB to canonicalize (skipped when the
 *     turn failed, so the failed message and its error stay visible)
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

  // Start of the running turn (or of its automatic resumption), for the live timer.
  const [turnStartedAt, setTurnStartedAt] = useState<number | null>(null);
  // Conversation whose turn the user stopped: its last turn reads « Tour interrompu » until the next send.
  const [stoppedConversationId, setStoppedConversationId] = useState<string | null>(null);
  // Set by useChat's onError during a turn, so that turn keeps its live messages instead of the refetch.
  const turnFailedRef = useRef(false);

  const {
    messages: chatMessages,
    status,
    sendMessage,
    regenerate,
    stop,
    addToolOutput,
    setMessages,
    error,
    clearError,
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
    // continuation loop when the server's « Étapes max » cap (agentMaxSteps
    // setting) lands on a step that happened to end with completed
    // server-tool results.
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithClientToolCalls,
    onError: () => {
      turnFailedRef.current = true;
    },
  });

  const annotateImageUrl = useChatStore((s) => s.annotateImageUrl);
  const closeAnnotate = useChatStore((s) => s.closeAnnotate);

  // When project changes, clear active conv so useConversations picks the new
  // project's first conv (or stays empty if none). Without this, the previous
  // project's conversation + history would bleed over into the new project.
  useEffect(() => {
    useChatStore.getState().setActive(null);
  }, [projectId]);

  // Load persisted history when active conversation changes, seeding
  // useChat's own message state directly via rowsToUIMessages (Task 4) —
  // this replaces the old history/setHistory adapter + rowToDisplay, which
  // parsed content_json as the stale v1 AnthropicBlock[] shape and rendered
  // every persisted message as an empty bubble now that Task 2's migration
  // has moved the DB to ModelMessage[]-shaped rows. A previous conversation's
  // error must not paint the loaded one, hence clearError().
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!activeConversationId) {
        if (!cancelled) {
          setMessages([]);
          clearError();
        }
        return;
      }
      const rows = (await fetch(`/api/agent/conversations/${activeConversationId}/messages`).then((r) => r.json())) as StoredMessageRow[];
      if (!cancelled) {
        setMessages(rowsToUIMessages(rows));
        clearError();
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [activeConversationId, setMessages, clearError]);

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
      setTurnStartedAt(Date.now());
      turnFailedRef.current = false;
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

  // Auto-create a conversation if none is active, so a send never needs a second click.
  const ensureConversation = useCallback(async (): Promise<string | null> => {
    if (activeConversationId) return activeConversationId;
    const r = await fetch("/api/agent/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: projectId }),
    });
    if (!r.ok) return null;
    const conv = (await r.json()) as { id: string };
    useChatStore.getState().setActive(conv.id);
    return conv.id;
  }, [activeConversationId, projectId]);

  // Attachments deliberately do NOT go through AI SDK's own `files`/
  // FileUIPart mechanism (Plan 2's Task 7 decision keeps AttachButton.tsx's
  // existing `stored:<id>` string flow) — they're sent as a sibling
  // top-level `attachments` field in `body`, read by route-handler.ts.
  const requestBody = useCallback(
    (conversationId: string, attachmentsToSend: ChatAttachment[] = []) => ({
      conversation_id: conversationId,
      project_id: projectId,
      canvas_snapshot: snapshotCanvas(nodes, edges),
      attachments: attachmentsToSend.map((a) => ({ type: "image" as const, source: a.source })),
    }),
    [projectId, nodes, edges],
  );

  // Runs one turn (a send, an « Et maintenant » reply or a « Réessayer »),
  // then canonicalizes the conversation from the DB.
  const runTurn = useCallback(
    async (conversationId: string, start: () => Promise<void>) => {
      setStoppedConversationId(null);
      setTurnStartedAt(Date.now());
      turnFailedRef.current = false;
      await start();
      // A failed turn keeps its live messages: the refetch would drop the
      // user's unsaved message together with the error row under it.
      if (turnFailedRef.current) return;

      // Refetch persisted history (canonical assistant message replaces the live one).
      // If the user switched conversations mid-stream, the active conv has changed —
      // discard the refetch so we don't paint old messages over the new conv's UI.
      const rows = (await fetch(`/api/agent/conversations/${conversationId}/messages`).then((r) => r.json())) as StoredMessageRow[];
      if (useChatStore.getState().activeConversationId !== conversationId) return;
      setMessages(rowsToUIMessages(rows));

      // Cheap, idempotent, always safe to call — useConversations refetches
      // the whole list on every bump. This is how the conversation list picks
      // up an auto-generated title (route-handler.ts's generateAndPersistTitle,
      // fire-and-forget server-side on a conversation's first turn) — there's
      // no more SSE `conversation_renamed` event under v2 to trigger this
      // precisely, so bumping unconditionally after every send is the simplest
      // correct replacement. If the title write raced past this refetch, the
      // list just shows the old title until the next bump.
      useChatStore.getState().bumpConversationListVersion();
    },
    [setMessages],
  );

  const onSend = useCallback(async () => {
    const conversationId = await ensureConversation();
    if (!conversationId) return;
    const text = draft;
    const attachmentsToSend = attachments;
    setDraft("");
    clearAttachments();
    // useChat's sendMessage pushes the user's UIMessage into `chatMessages`
    // synchronously before the network call resolves, so no manual
    // optimistic append is needed here.
    await runTurn(conversationId, () => sendMessage({ text }, { body: requestBody(conversationId, attachmentsToSend) }));
  }, [ensureConversation, draft, attachments, setDraft, clearAttachments, runTurn, sendMessage, requestBody]);

  const busy = isBusyStatus(status);

  // « Et maintenant » → ask_agent: same path as the composer, without touching the draft.
  const onAskAgent = useCallback(
    (message: string) => {
      if (busy) return;
      void (async () => {
        const conversationId = await ensureConversation();
        if (!conversationId) return;
        await runTurn(conversationId, () => sendMessage({ text: message }, { body: requestBody(conversationId) }));
      })();
    },
    [busy, ensureConversation, runTurn, sendMessage, requestBody],
  );

  // « Réessayer »: regenerate drops the failed assistant message (if any) and
  // re-runs the last user message — its text only, attachments are not re-sent.
  const retryText = lastUserText(chatMessages);
  const onRetry = useMemo(() => {
    if (busy || !retryText || !activeConversationId) return null;
    const conversationId = activeConversationId;
    return () => {
      void runTurn(conversationId, () => regenerate({ body: requestBody(conversationId) }));
    };
  }, [busy, retryText, activeConversationId, runTurn, regenerate, requestBody]);

  const onStop = useCallback(() => {
    setStoppedConversationId(activeConversationId);
    stop();
  }, [activeConversationId, stop]);

  const controls = useMemo<ChatTurnControls>(
    () => ({
      status,
      errorMessage: error?.message ?? null,
      turnStartedAt,
      stoppedLive: stoppedConversationId !== null && stoppedConversationId === activeConversationId,
      onAskAgent,
      onRetry,
    }),
    [status, error, turnStartedAt, stoppedConversationId, activeConversationId, onAskAgent, onRetry],
  );

  return (
    <>
      {/* Kept mounted while minimised so scroll position and any in-flight
          stream survive a minimise/reopen; `hidden` only removes it from view. */}
      <aside
        hidden={!open}
        className="fixed right-4 bottom-4 z-40 h-[min(640px,calc(100vh-2rem))] w-[400px] max-w-[calc(100vw-2rem)] origin-bottom-right animate-in fade-in zoom-in-95 duration-150 motion-reduce:animate-none"
      >
        <Card className="flex h-full flex-col gap-0 overflow-hidden py-0 shadow-2xl">
          <ChatHeader projectId={projectId} status={status} onMinimize={() => setOpen(false)} />

          <CardContent className="flex flex-1 flex-col overflow-hidden p-0">
            <MessageList messages={chatMessages} controls={controls} />

            {/* A pending client request stays visible, outside the folded steps, right above the composer. */}
            {pendingToolPart && (
              <PendingUiAction part={pendingToolPart} onResolve={respondToUiTool} />
            )}
          </CardContent>

          <CardFooter className="p-0">
            <Composer onSend={onSend} status={status} onStop={onStop} />
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
                className="fixed right-4 bottom-4 z-40 rounded-2xl transition-transform duration-200 animate-in fade-in zoom-in-75 hover:-translate-y-0.5 motion-reduce:animate-none motion-reduce:transition-none motion-reduce:hover:translate-y-0 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <AgentAvatar size="lg" />
                {busy && (
                  <span className="absolute -top-1 -right-1 flex size-3.5">
                    <span className="absolute inline-flex size-full animate-ping rounded-full motion-reduce:animate-none bg-violet-400 opacity-75" />
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
