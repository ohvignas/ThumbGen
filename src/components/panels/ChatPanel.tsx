"use client";
import { useEffect, useMemo, useCallback, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { useReactFlow } from "@xyflow/react";
import type { UIMessage } from "ai";
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
import { toast } from "@/components/ui/toast";
import { useAgentRuns } from "@/components/agent-runs/AgentRunsProvider";
import { AGENT_BUSY_MESSAGE } from "@/lib/agent/v2/run-types";
import { rowsToUIMessages, type StoredMessageRow } from "./chat/history-to-ui-messages";
import { snapshotCanvas } from "./chat/canvas-snapshot";
import { createAgentChatTransport, stopAgentRun } from "./chat/chat-transport";
import {
  isAgentBusyError,
  isOrphanUserTurn,
  resumeWithoutStreamOutcome,
  stopFollowUp,
  withoutTrailingUserMessage,
} from "./chat/resume-model";
import {
  conversationChangeEffects,
  liveTurnStart,
  retryableUserText,
  shouldRefetchAfterResume,
  type LiveTurnStart,
} from "./chat/chat-view-model";
import { isBusyStatus } from "./chat/turn-model";
import { applyCanvasPatchPart } from "./chat/canvas-patch-part";
import { clientToolNameOfPartType } from "@/lib/agent/client-tools";

// Per-browser UI preference, so a minimised agent stays minimised on reload.
const OPEN_STORAGE_KEY = "thumbgen.chat.open";
/** « Arrêter » also abandons the local stream if the server has not ended it by then. */
const STOP_FALLBACK_MS = 10_000;

function readStoredOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_STORAGE_KEY) !== "false";
  } catch {
    return true;
  }
}

async function loadHistoryMessages(conversationId: string): Promise<UIMessage[]> {
  const rows = (await fetch(`/api/agent/conversations/${conversationId}/messages`).then((r) => r.json())) as StoredMessageRow[];
  return rowsToUIMessages(rows);
}

const isActiveConversation = (conversationId: string) => useChatStore.getState().activeConversationId === conversationId;

/**
 * Right-side chat panel. Mounted from Canvas, on the miniature page only.
 *
 * Lifecycle (chantier F1: a turn belongs to the server, not to this page):
 *   - Opening a conversation loads its history, then reconnects to the turn the
 *     server may be running there (resumeStream → GET …/stream, 204 if none).
 *   - A send streams as before; leaving the page only drops the local stream.
 *   - « Arrêter » asks the server (POST …/stop); the stream ends by itself.
 *   - At the end of any turn: canonical refetch of the history (skipped when
 *     the turn failed, so the failed message and its error stay visible).
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

  const { snapshot: runsSnapshot, refreshRuns } = useAgentRuns();
  const runsSnapshotRef = useRef(runsSnapshot);
  useEffect(() => {
    runsSnapshotRef.current = runsSnapshot;
  }, [runsSnapshot]);

  // Start of the running turn (or of the reconnected one), for the live timer.
  const [turnStartedAt, setTurnStartedAt] = useState<number | null>(null);
  // Conversation whose turn the user stopped: its last turn reads « Tour interrompu » until the next send.
  const [stoppedConversationId, setStoppedConversationId] = useState<string | null>(null);
  // Messages present when the running turn started: « Arrêter » never marks an older turn interrupted.
  const [liveTurn, setLiveTurn] = useState<LiveTurnStart | null>(null);
  // Conversation reopened on a user message the server never answered (e.g. after a restart).
  const [orphanConversationId, setOrphanConversationId] = useState<string | null>(null);
  // Set by useChat's onError during a turn, so that turn keeps its live messages instead of the refetch.
  const turnFailedRef = useRef(false);
  // Set by onError when the send got a 409: a turn already runs in this conversation.
  const busyConflictRef = useRef(false);
  // Conversation the first send just created: its (empty) history is not loaded over the live messages.
  const createdConversationIdRef = useRef<string | null>(null);
  // Conversation of a resumed turn (client-request answer or reconnection), refetched once it ends.
  const resumedConversationIdRef = useRef<string | null>(null);
  const stopFallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // « Arrêter » pressed before the server registered the turn: sent again at the first chunk.
  const pendingStopRef = useRef<string | null>(null);
  // A send (composer or « Et maintenant ») is being started or is running: a second one is ignored.
  const sendInFlightRef = useRef(false);
  // Client requests (request_user_image / request_user_sketch) already answered from this panel.
  const answeredToolCallIdsRef = useRef(new Set<string>());

  // One transport for the panel's life. `reconnectStatus` holds the HTTP status of
  // the last reconnection (200 replays a run, 204 means none runs), written by the
  // transport's fetch — a closure, not a ref, since the transport is built during render.
  const [{ transport, reconnectStatus }] = useState(() => {
    let lastStatus: number | null = null;
    return {
      reconnectStatus: {
        reset: () => {
          lastStatus = null;
        },
        read: () => lastStatus,
      },
      transport: createAgentChatTransport({
        getConversationId: () => useChatStore.getState().activeConversationId,
        onReconnectStatus: (status) => {
          lastStatus = status;
        },
      }),
    };
  });

  const { fitView } = useReactFlow();

  const {
    messages: chatMessages,
    status,
    sendMessage,
    regenerate,
    stop,
    resumeStream,
    addToolOutput,
    setMessages,
    error,
    clearError,
  } = useChat({
    // Seeded by the history effect below as soon as a conversation is active.
    messages: [],
    transport,
    // Auto-resumes ONLY once a client tool (request_user_image) was resolved via
    // addToolOutput — see the function's doc comment. A reconnection never
    // produces a resolved client request, so it never triggers a send.
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithClientToolCalls,
    // Guided interview: a node place_node wrote in the database, shown live and
    // centered (transient part: never in the messages, never sent back).
    onData: (dataPart) => {
      applyCanvasPatchPart(dataPart, {
        openProjectId: projectId,
        reducedMotion: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
        // Next frame: React Flow measures the new node first.
        fitNode: (nodeId, duration) => {
          window.requestAnimationFrame(() => {
            void fitView({ nodes: [{ id: nodeId }], padding: 0.4, maxZoom: 1, duration });
          });
        },
      });
    },
    onError: (turnError) => {
      turnFailedRef.current = true;
      if (isAgentBusyError(turnError)) busyConflictRef.current = true;
    },
  });

  const annotateImageUrl = useChatStore((s) => s.annotateImageUrl);
  const closeAnnotate = useChatStore((s) => s.closeAnnotate);

  // When project changes, clear active conv so useConversations picks the new project's conversation.
  useEffect(() => {
    useChatStore.getState().setActive(null);
  }, [projectId]);

  // Reconnects to the turn the server may be running for this conversation.
  // Never starts one: a GET that answers 204 when nothing runs.
  const resumeConversation = useCallback(
    async (conversationId: string, history: UIMessage[]) => {
      if (!isActiveConversation(conversationId)) return;
      const listedRun = runsSnapshotRef.current.running.find((run) => run.conversationId === conversationId) ?? null;
      setStoppedConversationId(null);
      setOrphanConversationId(null);
      setLiveTurn(liveTurnStart(history));
      setTurnStartedAt(listedRun?.startedAt ?? Date.now());
      turnFailedRef.current = false;
      resumedConversationIdRef.current = conversationId;
      reconnectStatus.reset();
      await resumeStream();
      if (reconnectStatus.read() === 200) {
        // A run was replayed to its end: the status effect below refetches the canonical history.
        return;
      }
      resumedConversationIdRef.current = null;
      if (reconnectStatus.read() !== 204 || !isActiveConversation(conversationId)) return;
      const runsNow = await refreshRuns();
      if (!isActiveConversation(conversationId)) return;
      const outcome = resumeWithoutStreamOutcome({ conversationId, listedRunningBefore: listedRun !== null, runsNow });
      let messages = history;
      if (outcome.refetch) {
        messages = await loadHistoryMessages(conversationId);
        if (!isActiveConversation(conversationId)) return;
        setMessages(messages);
      }
      if (isOrphanUserTurn(messages, outcome.runningNow)) setOrphanConversationId(conversationId);
    },
    [resumeStream, refreshRuns, setMessages, reconnectStatus],
  );

  // Load the persisted history when the active conversation changes, then
  // reconnect. A conversation that ensureConversation just created for the
  // first send is skipped entirely (its live messages and error stay). Any
  // other change first drops the local stream — the server turn goes on.
  useEffect(() => {
    const effects = conversationChangeEffects(activeConversationId, createdConversationIdRef.current);
    if (activeConversationId !== createdConversationIdRef.current) createdConversationIdRef.current = null;
    if (effects.stopRunningTurn) void stop();
    if (!effects.loadHistory) return;
    let cancelled = false;
    const load = async () => {
      if (!activeConversationId) {
        if (!cancelled) {
          setMessages([]);
          clearError();
          setOrphanConversationId(null);
        }
        return;
      }
      const history = await loadHistoryMessages(activeConversationId);
      if (cancelled) return;
      setMessages(history);
      clearError();
      void resumeConversation(activeConversationId, history);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [activeConversationId, setMessages, clearError, stop, resumeConversation]);

  // The last message's pending client-tool part, only in state "input-available"
  // (offering a resolution in any other state is unsafe — see chantier E).
  const pendingToolPart = useMemo<PendingToolPart | undefined>(() => {
    const lastMessage = chatMessages.at(-1);
    return lastMessage?.role === "assistant"
      ? lastMessage.parts.find(
          (p): p is PendingToolPart =>
            clientToolNameOfPartType(p.type) !== null && "state" in p && p.state === "input-available",
        )
      : undefined;
  }, [chatMessages]);

  // Resolves PendingUiAction's pending part via useChat's addToolOutput. `options.body`
  // is required: the auto-continuation goes through the same transport as a send.
  const respondToUiTool = useCallback(
    (toolCallId: string, result: unknown) => {
      // One answer per request: a double submit before the re-render would post the continuation twice.
      if (!pendingToolPart || answeredToolCallIdsRef.current.has(toolCallId)) return;
      const toolName = clientToolNameOfPartType(pendingToolPart.type);
      if (!toolName) return;
      answeredToolCallIdsRef.current.add(toolCallId);
      setStoppedConversationId(null);
      setOrphanConversationId(null);
      setLiveTurn(liveTurnStart(chatMessages, chatMessages.at(-1)?.id ?? null));
      setTurnStartedAt(Date.now());
      turnFailedRef.current = false;
      resumedConversationIdRef.current = activeConversationId;
      // addToolOutput may answer void or a PromiseLike: always hand back a real Promise.
      const sending = Promise.resolve(addToolOutput({
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
      }));
      // Not sent: the request can be answered again (PendingUiAction unlocks its card on the same rejection).
      sending.catch(() => answeredToolCallIdsRef.current.delete(toolCallId));
      return sending;
    },
    [addToolOutput, pendingToolPart, chatMessages, activeConversationId, projectId, nodes, edges],
  );

  // Canonical refetch for a resumed turn (client-request answer or reconnection),
  // once its status goes from busy back to ready (runTurn does it for the others).
  const previousStatusRef = useRef(status);
  useEffect(() => {
    const previousStatus = previousStatusRef.current;
    previousStatusRef.current = status;
    const conversationId = resumedConversationIdRef.current;
    const refetch = shouldRefetchAfterResume({
      previousStatus,
      status,
      resumedConversationId: conversationId,
      turnFailed: turnFailedRef.current,
    });
    if (conversationId !== null && isBusyStatus(previousStatus) && !isBusyStatus(status)) {
      resumedConversationIdRef.current = null;
    }
    if (!refetch || conversationId === null) return;
    void (async () => {
      const messages = await loadHistoryMessages(conversationId);
      if (!isActiveConversation(conversationId)) return;
      setMessages(messages);
      useChatStore.getState().bumpConversationListVersion();
    })();
  }, [status, setMessages]);

  // Indicators elsewhere follow this page's turns without waiting for the next poll.
  // Not on the first render: the provider and useConversations already fetch then.
  // (Leaving the page: useChat itself aborts the local stream on unmount; the server turn goes on.)
  const refreshedStatusRef = useRef(status);
  useEffect(() => {
    if (refreshedStatusRef.current === status) return;
    refreshedStatusRef.current = status;
    if (status === "streaming" || status === "ready" || status === "error") void refreshRuns();
  }, [status, refreshRuns]);

  // « Arrêter » bookkeeping: a stop pressed too early is re-sent at the first
  // chunk; nothing pending survives the end of the turn.
  const statusRef = useRef(status);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  // Drops the local stream only (the last resort of « Arrêter »).
  const abandonLocalStream = useCallback(() => {
    if (stopFallbackRef.current !== null) {
      clearTimeout(stopFallbackRef.current);
      stopFallbackRef.current = null;
    }
    void stop();
  }, [stop]);

  // POST …/stop, then whatever its answer calls for (see stopFollowUp).
  const requestServerStop = useCallback(
    (conversationId: string) => {
      const attempt = (retried: boolean) => {
        void stopAgentRun(conversationId).then((result) => {
          const followUp = stopFollowUp({ result, status: statusRef.current, retried });
          if (followUp === "local-stop") abandonLocalStream();
          else if (followUp === "retry-now") attempt(true);
          else if (followUp === "retry-when-streaming") pendingStopRef.current = conversationId;
        });
      };
      attempt(false);
    },
    [abandonLocalStream],
  );

  useEffect(() => {
    if (status === "streaming" && pendingStopRef.current !== null) {
      const conversationId = pendingStopRef.current;
      pendingStopRef.current = null;
      requestServerStop(conversationId);
    }
    if (isBusyStatus(status)) return;
    pendingStopRef.current = null;
    if (stopFallbackRef.current !== null) {
      clearTimeout(stopFallbackRef.current);
      stopFallbackRef.current = null;
    }
  }, [status, requestServerStop]);

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
    createdConversationIdRef.current = conv.id;
    useChatStore.getState().setActive(conv.id);
    return conv.id;
  }, [activeConversationId, projectId]);

  // Attachments go as a sibling `attachments` field (stored:<id> references), not AI SDK file parts.
  const requestBody = useCallback(
    (conversationId: string, attachmentsToSend: ChatAttachment[] = []) => ({
      conversation_id: conversationId,
      project_id: projectId,
      canvas_snapshot: snapshotCanvas(nodes, edges),
      attachments: attachmentsToSend.map((a) => ({ type: "image" as const, source: a.source })),
    }),
    [projectId, nodes, edges],
  );

  // Runs one turn (a send, an « Et maintenant » reply or a « Réessayer »), then
  // canonicalizes the conversation from the DB. `restoreInput` puts back what a
  // refused send (409) had taken from the composer.
  // After a 409: the toast instead of an error, then the stored history and a
  // reconnection to the turn that runs there.
  const recoverFromBusyConflict = useCallback(
    async (conversationId: string) => {
      clearError();
      // A refused client-request answer can be given again once the history is reloaded.
      answeredToolCallIdsRef.current.clear();
      toast({ title: AGENT_BUSY_MESSAGE });
      if (!isActiveConversation(conversationId)) return;
      const history = await loadHistoryMessages(conversationId);
      if (!isActiveConversation(conversationId)) return;
      setMessages(history);
      await resumeConversation(conversationId, history);
    },
    [clearError, setMessages, resumeConversation],
  );

  const runTurn = useCallback(
    async (conversationId: string, start: () => Promise<void>, restoreInput?: () => void) => {
      setStoppedConversationId(null);
      setOrphanConversationId(null);
      setLiveTurn(liveTurnStart(chatMessages));
      setTurnStartedAt(Date.now());
      turnFailedRef.current = false;
      busyConflictRef.current = false;
      resumedConversationIdRef.current = null;
      await start();

      if (busyConflictRef.current) {
        // 409: the server already runs a turn here (another tab, or one not reconnected yet).
        busyConflictRef.current = false;
        setMessages((messages) => withoutTrailingUserMessage(messages));
        restoreInput?.();
        await recoverFromBusyConflict(conversationId);
        return;
      }
      // A failed turn keeps its live messages: the refetch would drop the
      // user's unsaved message together with the error row under it.
      if (turnFailedRef.current) return;

      const messages = await loadHistoryMessages(conversationId);
      if (!isActiveConversation(conversationId)) return;
      setMessages(messages);
      // Picks up an auto-generated title (fire-and-forget on the first turn).
      useChatStore.getState().bumpConversationListVersion();
    },
    [chatMessages, setMessages, recoverFromBusyConflict],
  );

  // A 409 on a client-request answer (its automatic continuation, not a runTurn):
  // same recovery as a refused send instead of a raw error Alert. The request stays
  // pending in the reloaded history, so it can be answered again later.
  useEffect(() => {
    if (status !== "error" || !busyConflictRef.current || sendInFlightRef.current) return;
    busyConflictRef.current = false;
    const conversationId = useChatStore.getState().activeConversationId;
    if (conversationId) void recoverFromBusyConflict(conversationId);
  }, [status, recoverFromBusyConflict]);

  const onSend = useCallback(async () => {
    // Two send events before React re-renders (a double click, Enter + click)
    // would run two turns on one local chat: the second one is dropped here.
    if (sendInFlightRef.current) return;
    sendInFlightRef.current = true;
    try {
      const conversationId = await ensureConversation();
      if (!conversationId) return;
      const text = draft;
      const attachmentsToSend = attachments;
      setDraft("");
      clearAttachments();
      await runTurn(
        conversationId,
        () => sendMessage({ text }, { body: requestBody(conversationId, attachmentsToSend) }),
        () => {
          const store = useChatStore.getState();
          store.setDraft(text);
          for (const attachment of attachmentsToSend) store.addAttachment(attachment);
        },
      );
    } finally {
      sendInFlightRef.current = false;
    }
  }, [ensureConversation, draft, attachments, setDraft, clearAttachments, runTurn, sendMessage, requestBody]);

  const busy = isBusyStatus(status);

  // « Et maintenant » → ask_agent: same path as the composer, without touching the draft.
  const onAskAgent = useCallback(
    (message: string) => {
      if (busy || sendInFlightRef.current) return;
      sendInFlightRef.current = true;
      void (async () => {
        try {
          const conversationId = await ensureConversation();
          if (!conversationId) return;
          await runTurn(conversationId, () => sendMessage({ text: message }, { body: requestBody(conversationId) }));
        } finally {
          sendInFlightRef.current = false;
        }
      })();
    },
    [busy, ensureConversation, runTurn, sendMessage, requestBody],
  );

  // « Réessayer »: regenerate re-runs the last user message (text only).
  const retryText = retryableUserText(chatMessages);
  const onRetry = useMemo(() => {
    if (busy || !retryText || !activeConversationId) return null;
    const conversationId = activeConversationId;
    return () => {
      if (sendInFlightRef.current) return;
      sendInFlightRef.current = true;
      void runTurn(conversationId, () => regenerate({ body: requestBody(conversationId) })).finally(() => {
        sendInFlightRef.current = false;
      });
    };
  }, [busy, retryText, activeConversationId, runTurn, regenerate, requestBody]);

  // « Arrêter »: the server stops and saves the turn, then its stream ends by
  // itself. A local stop() alone would leave the paid turn running on the server.
  const onStop = useCallback(() => {
    const conversationId = activeConversationId;
    setStoppedConversationId(conversationId);
    if (!conversationId) {
      abandonLocalStream();
      return;
    }
    if (stopFallbackRef.current !== null) clearTimeout(stopFallbackRef.current);
    // Still not ended after 10 s: ask the server once more, then drop the local stream.
    stopFallbackRef.current = setTimeout(() => {
      stopFallbackRef.current = null;
      void stopAgentRun(conversationId).finally(abandonLocalStream);
    }, STOP_FALLBACK_MS);
    requestServerStop(conversationId);
  }, [activeConversationId, abandonLocalStream, requestServerStop]);

  const controls = useMemo<ChatTurnControls>(
    () => ({
      status,
      errorMessage: error?.message ?? null,
      turnStartedAt,
      stoppedLive: stoppedConversationId !== null && stoppedConversationId === activeConversationId,
      liveTurnStart: liveTurn,
      orphanUserTurn: orphanConversationId !== null && orphanConversationId === activeConversationId,
      onAskAgent,
      onRetry,
    }),
    [status, error, turnStartedAt, stoppedConversationId, activeConversationId, liveTurn, orphanConversationId, onAskAgent, onRetry],
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
