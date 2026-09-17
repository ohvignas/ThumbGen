import { NextRequest } from "next/server";
import {
  streamText,
  isStepCount,
  hasToolCall,
  createUIMessageStream,
  createUIMessageStreamResponse,
  type ModelMessage,
  type UIMessageStreamWriter,
} from "ai";
import { FAKE_AGENT_WARNING, resolveAgentLanguageModel } from "./agent-model";
import { buildAiSdkTools } from "./tool-adapter";
import { V2_CLIENT_TOOLS } from "./browser-client-tools";
import { holdsResolvedAskUser, trimToolResultImages } from "./history-images";
import { webSearchProviderOptions } from "./web-search-tool";
import { persistAssistantTurn } from "./persist-turn";
import { PLACE_NODE_TOOL_NAME, buildPlaceNodeTool } from "./place-node-tool";
import { UPDATE_BRIEF_TOOL_NAME, buildUpdateBriefTool } from "./update-brief-tool";
import { getBrief } from "@/lib/brief/store";
import { guardSketchHandler } from "@/lib/brief/sketch-guard";
import { BRIEF_UPDATED_PART } from "@/lib/brief/brief-updated";
import type { ThumbnailBrief } from "@/lib/brief/schema";
import { CLIENT_TOOL_NAME_SET, clientToolNameOfPartType } from "@/lib/agent/client-tools";
import { CANVAS_PATCH_PART } from "@/lib/canvas/canvas-patch";
import { discardRun, pumpRunStream, runStatusForOutcome, startRun, subscribe } from "./run-registry";
import { AGENT_BUSY_MESSAGE, type EndedRunStatus } from "./run-types";
import { FINISH_TURN_TOOL_NAME } from "@/lib/agent/finish-turn";
import { buildSystemMessages } from "@/lib/agent/system-prompt";
import { appendMessage, getConversation, listMessages } from "@/lib/agent/conversation/store";
import { generateAndPersistTitle } from "@/lib/agent/conversation/auto-title";
import { resolveImageSource } from "@/lib/agent/tools/_helpers/image-source";
import { getTypedSettings } from "@/lib/settings";
import { getModelById } from "@/lib/agent/models";
import { loadAgentPromptPrefs } from "@/lib/agent/prompt-prefs";
import { startGcLoop } from "@/lib/agent/gc";
import { rejectNonJsonRequest } from "@/lib/youtube/route-errors";

if (typeof window === "undefined") startGcLoop();

/**
 * Retroactively fixes up any persisted tool-result image part whose `data`
 * field is still a bare base64 string (every row written before Task 14's
 * Bug 2 fix landed, plus any row `scripts/migrate-chat-messages-to-uimessage.ts`
 * wrote before ITS matching fix) into the tagged `{type:"data", data}`
 * shape `type:"file"` actually requires — see tool-adapter.ts's
 * toModelOutput for the full explanation of why the bare string fails real
 * ModelMessage[] validation.
 *
 * Without this, an old poisoned row (confirmed for real: rowid 151 in
 * conversation ad1f4e56-...) fails `modelMessageSchema` forever — every
 * future request in that conversation errors, `route-handler.ts`'s
 * `looksMigrated` guard above only checks for a `role` key and never
 * shape-validates deeper, so it lets these through unnoticed. Applied here,
 * on READ, to the messages actually sent to the model — this makes old rows
 * retroactively valid without a separate migration pass or ever rewriting
 * the DB. `structuredClone` avoids mutating the caller's parsed value in
 * place (defensive; nothing else currently holds a reference to it, but the
 * cost is negligible and it keeps this function obviously side-effect-free).
 */
function normalizeStaleToolResultFileData(messages: unknown[]): unknown[] {
  return messages.map((m) => {
    if (typeof m !== "object" || m === null) return m;
    const msg = m as { role?: unknown; content?: unknown };
    if (msg.role !== "tool" || !Array.isArray(msg.content)) return m;
    let changed = false;
    const content = msg.content.map((part) => {
      if (typeof part !== "object" || part === null) return part;
      const p = part as { type?: unknown; output?: unknown };
      if (p.type !== "tool-result" || typeof p.output !== "object" || p.output === null) return part;
      const output = p.output as { type?: unknown; value?: unknown };
      if (output.type !== "content" || !Array.isArray(output.value)) return part;
      let outputChanged = false;
      const value = output.value.map((item) => {
        if (typeof item !== "object" || item === null) return item;
        const i = item as { type?: unknown; data?: unknown };
        if (i.type === "file" && typeof i.data === "string") {
          outputChanged = true;
          return { ...i, data: { type: "data" as const, data: i.data } };
        }
        return item;
      });
      if (!outputChanged) return part;
      changed = true;
      return { ...p, output: { ...output, value } };
    });
    return changed ? { ...msg, content } : m;
  });
}

const CLIENT_TOOL_NAMES = CLIENT_TOOL_NAME_SET;

/** Every `toolCallId` that already has a persisted `role:"tool"` result somewhere
 * in this conversation's rows — shared by the abandoned-request scan below and
 * the tool-continuation dedup further down (both need the same "has this
 * already been resolved, anywhere in this conversation" answer). */
function collectResolvedToolCallIds(rows: { content_json: string }[]): Set<string> {
  const ids = new Set<string>();
  for (const row of rows) {
    const parsed: unknown = JSON.parse(row.content_json);
    if (!Array.isArray(parsed)) continue;
    for (const m of parsed) {
      if (typeof m !== "object" || m === null || (m as { role?: unknown }).role !== "tool") continue;
      const content = (m as { content?: unknown }).content;
      if (!Array.isArray(content)) continue;
      for (const c of content) {
        const toolCallId = (c as { toolCallId?: unknown } | null)?.toolCallId;
        if (typeof toolCallId === "string") ids.add(toolCallId);
      }
    }
  }
  return ids;
}

/**
 * Finds any `request_user_image`/`request_user_sketch` tool-call in the
 * conversation's LAST row that has no matching tool-result yet — i.e. a
 * pending human-in-the-loop request the user ignored and is about to send a
 * new message past instead of resolving/skipping via PendingUiAction.tsx.
 *
 * Without this, that tool-call row stays dangling forever: every future
 * `priorMessages` reconstruction (below) includes an assistant tool-call
 * with no matching tool-result, which both Anthropic and OpenAI reject —
 * permanently bricking the conversation the same way an unresolved
 * duplicate resolution did before Task 11's dedup fix (see
 * `alreadyPersistedToolCallIds` below), just via the opposite path (a
 * missing result instead of a duplicate one).
 *
 * Only the LAST row is checked — an unresolved call in an OLDER row would
 * mean a later row already moved the conversation past it (e.g. a
 * subsequent successful turn), which isn't the abandonment scenario this
 * guards against and isn't expected to occur given how rows are persisted.
 */
function findAbandonedClientToolCalls(rows: { role: string; content_json: string }[]): Array<{ toolCallId: string; toolName: string }> {
  const lastRow = rows.at(-1);
  if (!lastRow || lastRow.role !== "assistant") return [];
  const parsed: unknown = JSON.parse(lastRow.content_json);
  if (!Array.isArray(parsed)) return [];
  const resolved = collectResolvedToolCallIds(rows);
  const out: Array<{ toolCallId: string; toolName: string }> = [];
  for (const m of parsed) {
    if (typeof m !== "object" || m === null || (m as { role?: unknown }).role !== "assistant") continue;
    const content = (m as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const c of content) {
      if (typeof c !== "object" || c === null) continue;
      const part = c as { type?: unknown; toolCallId?: unknown; toolName?: unknown };
      if (
        part.type === "tool-call" &&
        typeof part.toolCallId === "string" &&
        typeof part.toolName === "string" &&
        CLIENT_TOOL_NAMES.has(part.toolName) &&
        !resolved.has(part.toolCallId)
      ) {
        out.push({ toolCallId: part.toolCallId, toolName: part.toolName });
      }
    }
  }
  return out;
}

type StoredRow = { role: string; content_json: string; interrupted?: number };

/** Text of a stored user row (its text parts joined), or null when it can't be read. */
function storedUserText(row: StoredRow): string | null {
  try {
    const parsed: unknown = JSON.parse(row.content_json);
    if (!Array.isArray(parsed)) return null;
    return parsed
      .flatMap((m) => {
        const content = (m as { role?: unknown; content?: unknown } | null)?.content;
        return (m as { role?: unknown } | null)?.role === "user" && Array.isArray(content) ? content : [];
      })
      .map((c) => {
        const part = c as { type?: unknown; text?: unknown } | null;
        return part?.type === "text" && typeof part.text === "string" ? part.text : "";
      })
      .join("");
  } catch {
    return null;
  }
}

/** A row that only records an abandoned client request (the skip results appended before a new user row). */
function isAbandonedSkipRow(row: StoredRow): boolean {
  try {
    const parsed: unknown = JSON.parse(row.content_json);
    return (
      Array.isArray(parsed) &&
      parsed.length > 0 &&
      parsed.every((m) => {
        const msg = m as { role?: unknown; content?: unknown } | null;
        return (
          msg?.role === "tool" &&
          Array.isArray(msg.content) &&
          msg.content.every((c) => {
            const value = (c as { output?: { value?: { skipped?: unknown; reason?: unknown } } } | null)?.output?.value;
            return value?.skipped === true && value.reason === "abandoned";
          })
        );
      })
    );
  } catch {
    return false;
  }
}

/**
 * Index of the stored user row that a new user message repeats after its turn
 * never finished — what « Réessayer » (useChat's regenerate) sends — or -1.
 * Only interrupted assistant rows (a stop or a stream failure) and abandoned-
 * request skip rows may follow it; after a completed answer the same text is a
 * genuinely new message. A request that failed before writing anything (e.g. a
 * 400 for a missing key) left no user row, so it is appended as usual.
 */
export function findRetriedUserRowIndex(rows: StoredRow[], text: string): number {
  if (!text) return -1;
  for (let index = rows.length - 1; index >= 0; index--) {
    const row = rows[index];
    if (row.role === "user") return storedUserText(row) === text ? index : -1;
    if (row.role !== "assistant" || !(row.interrupted === 1 || isAbandonedSkipRow(row))) return -1;
  }
  return -1;
}

/** Next's middleware/proxy client body limit (10 MB): a larger body arrives truncated. */
const MAX_CHAT_BODY_BYTES = 10 * 1024 * 1024;

type ChatRequestBody = {
  conversation_id?: string;
  /** Ignored: the project comes from the stored conversation. */
  project_id?: string;
  // The wire shape the chat transport sends: only the LAST UIMessage, trimmed to
  // what is read here (chat-transport.ts trimMessageForServer); prior history is
  // rebuilt from the DB. `attachments` carries this app's own `stored:<id>`
  // references (AttachButton.tsx / resolveImageSource), not AI SDK file parts.
  messages?: Array<{
    role: string;
    parts?: Array<{
      type: string;
      text?: string;
      // Tool parts only — read on the tool-continuation path, where the last
      // message is the ASSISTANT message whose client tool was just resolved.
      toolCallId?: string;
      state?: string;
      output?: unknown;
      errorText?: string;
    }>;
  }>;
  attachments?: Array<{ type: "image"; source: string }>;
  canvas_snapshot?: unknown;
};

export async function postV2(req: NextRequest): Promise<Response> {
  // A cross-site form or no-cors fetch cannot send JSON without a preflight:
  // another site open in the browser can never start a paid turn.
  const notJson = rejectNonJsonRequest(req);
  if (notJson) return notJson;

  const parsed = await req.json().then(
    (value: unknown) => ({ ok: true as const, value }),
    () => ({ ok: false as const }),
  );
  if (!parsed.ok) {
    // Next's proxy truncates a body over its 10 MB limit: say so instead of a
    // misleading « Missing conversation_id ».
    const contentLength = Number(req.headers.get("content-length") ?? "0");
    return contentLength > MAX_CHAT_BODY_BYTES
      ? new Response("Requête trop volumineuse", { status: 413 })
      : new Response("Corps JSON invalide", { status: 400 });
  }
  const body = parsed.value as ChatRequestBody | null;
  if (!body?.conversation_id) {
    return new Response("Missing conversation_id", { status: 400 });
  }

  const settings = getTypedSettings();
  const modelId = settings.agentModel;
  const agentModel = resolveAgentLanguageModel(modelId);
  if (!agentModel) {
    return new Response(
      "Clé OpenRouter non configurée. Ajoute-la dans Réglages → Connexions des modèles.",
      { status: 400 },
    );
  }
  const modelInfo = getModelById(modelId);
  const conversationId = body.conversation_id;

  const conversation = getConversation(conversationId);
  if (!conversation) return new Response("Conversation introuvable", { status: 404 });
  const projectId = conversation.project_id;

  // One turn per conversation. Checked and registered synchronously, BEFORE any
  // read or write of messages, the auto-title and the model call: a second
  // request (another tab, a double click) can never start a second paid turn.
  const run = startRun(conversationId, projectId);
  if (!run) {
    return new Response(AGENT_BUSY_MESSAGE, { status: 409, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  let priorMessages: unknown[];
  // The conversation's thumbnail brief, read once per turn (chantier F3): sent
  // to the model, and it switches the cost reductions below on.
  let brief: ThumbnailBrief | null = null;
  let systemText: string;
  let userParts: Array<
    { type: "text"; text: string } | { type: "file"; mediaType: string; data: string }
  >;

  // `body.messages.at(-1)` is a fresh user turn for a normal send, but NOT for
  // the auto-continuation sendAutomaticallyWhen fires once PendingUiAction.tsx
  // resolves a client tool: there it is the ASSISTANT message whose tool part
  // was just resolved (see the tool-continuation branch below).
  const lastMessage = body.messages?.at(-1);
  const isNewUserTurn = lastMessage?.role === "user";
  // A retry reuses its stored user row (index in the rows read before this
  // turn), so the model and the DB never see the message twice; -1 otherwise.
  let retriedUserRowIndex = -1;

  try {
    brief = getBrief(conversationId)?.brief ?? null;
    userParts = [];
    if (isNewUserTurn) {
      const lastMessageText = (lastMessage?.parts ?? [])
        .filter((p): p is { type: "text"; text: string } => p.type === "text" && typeof p.text === "string")
        .map((p) => p.text)
        .join("");

      if (lastMessageText) userParts.push({ type: "text", text: lastMessageText });
      for (const a of body.attachments ?? []) {
        if (a.type !== "image") continue;
        const img = await resolveImageSource(a.source);
        userParts.push({ type: "file", mediaType: img.mimeType, data: img.bytes.toString("base64") });
      }

      // Checked BEFORE appending the new user row: an empty conversation gets
      // exactly one auto-title attempt, on its first turn.
      const priorRowsForThisTurn = listMessages(conversationId);
      const isFirstTurn = priorRowsForThisTurn.length === 0;
      if ((body.attachments ?? []).length === 0) {
        retriedUserRowIndex = findRetriedUserRowIndex(priorRowsForThisTurn, lastMessageText);
      }

      // Auto-resolve a pending client request (request_user_image, ask_user…) the user is
      // sending a new message past — see findAbandonedClientToolCalls. Persisted
      // BEFORE the new user row so tool-call/tool-result pairing stays valid.
      const abandoned = findAbandonedClientToolCalls(priorRowsForThisTurn);
      if (abandoned.length > 0) {
        appendMessage({
          conversation_id: conversationId,
          role: "assistant",
          content_json: JSON.stringify([
            {
              role: "tool",
              content: abandoned.map((a) => ({
                type: "tool-result" as const,
                toolCallId: a.toolCallId,
                toolName: a.toolName,
                output: { type: "json" as const, value: { skipped: true, reason: "abandoned" } },
              })),
            },
          ]),
          interrupted: 0,
          total_input_tokens: 0,
          total_output_tokens: 0,
          cost_estimate: 0,
        });
      }

      if (retriedUserRowIndex === -1) {
        appendMessage({
          conversation_id: conversationId,
          role: "user",
          content_json: JSON.stringify([{ role: "user", content: userParts }]),
          interrupted: 0,
          total_input_tokens: 0,
          total_output_tokens: 0,
          cost_estimate: 0,
        });
      }

      // Fire-and-forget. Never with the fake model: the title is a model call.
      if (isFirstTurn && lastMessageText.trim() && settings.agentAutoTitle && !agentModel.fake) {
        void generateAndPersistTitle(conversationId, lastMessageText);
      }
    } else {
      // Tool-continuation: persist the client's resolution as its own
      // `role:"tool"` row (rowsToUIMessages folds it back by toolCallId), in the
      // wrapped `{type:"json"|"error-text", value}` output form modelMessageSchema
      // requires. The server is the dedup boundary: a resolved part whose
      // toolCallId already has a persisted result is never written twice.
      const alreadyPersistedToolCallIds = collectResolvedToolCallIds(listMessages(conversationId));

      const resolvedClientToolParts = (lastMessage?.parts ?? []).filter(
        (p): p is { type: string; toolCallId: string; state: string; output?: unknown; errorText?: string } =>
          clientToolNameOfPartType(p.type) !== null &&
          typeof p.toolCallId === "string" &&
          (p.state === "output-available" || p.state === "output-error") &&
          !alreadyPersistedToolCallIds.has(p.toolCallId),
      );
      if (resolvedClientToolParts.length > 0) {
        const toolResultMessage = {
          role: "tool" as const,
          content: resolvedClientToolParts.map((p) => ({
            type: "tool-result" as const,
            toolCallId: p.toolCallId,
            toolName: p.type.slice("tool-".length),
            output:
              p.state === "output-error"
                ? { type: "error-text" as const, value: p.errorText ?? "error" }
                : { type: "json" as const, value: p.output ?? null },
          })),
        };
        appendMessage({
          conversation_id: conversationId,
          role: "assistant",
          content_json: JSON.stringify([toolResultMessage]),
          interrupted: 0,
          total_input_tokens: 0,
          total_output_tokens: 0,
          cost_estimate: 0,
        });
      } else {
        // Defense-in-depth: a continuation with nothing to resume must never
        // re-run the model for up to agentMaxSteps steps.
        discardRun(run);
        return new Response(
          "No client-tool resolution found in this continuation; nothing to resume.",
          { status: 400 },
        );
      }
    }

    // Every prior row must already be ModelMessage-shaped (a `role` key); an old
    // v1 row gets a clear 400 instead of an opaque provider error. On a normal
    // send the row just appended is re-added from `userParts`; on a retry the
    // rows up to the stored user row are the prompt.
    const priorRows =
      retriedUserRowIndex !== -1
        ? listMessages(conversationId).slice(0, retriedUserRowIndex + 1)
        : isNewUserTurn
          ? listMessages(conversationId).slice(0, -1)
          : listMessages(conversationId);
    // Rows before the current user turn get their view_canvas_images /
    // search_youtube images replaced by a placeholder (model input only). On
    // a new send every prior row is earlier; on a retry or a continuation the
    // current turn starts at its stored user row.
    const turnStart =
      isNewUserTurn && retriedUserRowIndex === -1
        ? priorRows.length
        : Math.max(0, priorRows.map((row) => row.role).lastIndexOf("user"));
    // Each row is parsed once: the checks, the journey's trim start and the model input share it.
    const parsedRows: unknown[] = priorRows.map((row) => JSON.parse(row.content_json));
    // During a thumbnail journey every answer is a continuation: images older
    // than the last answered question are not re-sent either.
    let lastAnsweredRow = -1;
    if (brief) {
      for (let index = parsedRows.length - 1; index >= 0 && lastAnsweredRow === -1; index--) {
        if (holdsResolvedAskUser(parsedRows[index])) lastAnsweredRow = index;
      }
    }
    const currentTurnStart = Math.max(turnStart, lastAnsweredRow);
    priorMessages = [];
    for (const [rowIndex, parsed] of parsedRows.entries()) {
      const looksMigrated =
        Array.isArray(parsed) &&
        parsed.every((m) => typeof m === "object" && m !== null && "role" in (m as Record<string, unknown>));
      if (!looksMigrated) {
        discardRun(run);
        return new Response(
          "This conversation has messages in the old (pre-migration) format and can't " +
            "be continued on the new agent backend. Run scripts/migrate-chat-messages-to-uimessage.ts " +
            "first, then retry.",
          { status: 400 },
        );
      }
      const normalized = normalizeStaleToolResultFileData(parsed as unknown[]);
      priorMessages.push(...(rowIndex < currentTurnStart ? trimToolResultImages(normalized) : normalized));
    }

    const systemBlocks = buildSystemMessages(body.canvas_snapshot, projectId, loadAgentPromptPrefs(), brief);
    systemText = systemBlocks.map((b) => b.text).join("\n\n");
  } catch (e) {
    discardRun(run);
    return new Response(`Failed to prepare the conversation: ${(e as Error).message}`, { status: 400 });
  }

  // Guards the stream-level failure fallback below against double-persisting:
  // set at the top of streamText's own onEnd/onAbort (a failure after some
  // output fires both the per-chunk onError and onEnd for the same turn).
  let turnPersisted = false;

  // Nothing between here and the pump may leave the conversation locked: a
  // throw (tools, provider options, streamText, the UI stream) frees the run.
  try {
    if (agentModel.fake) console.warn(FAKE_AGENT_WARNING);
    // place_node and update_brief broadcast to the open chat as transient chunks
    // of this turn's stream (`data-canvas-patch`, `data-brief-updated`) —
    // the same stream the run buffers and replays. The writer exists as soon as
    // the composed stream below is built, before any tool can run.
    let uiWriter: UIMessageStreamWriter | null = null;
    const placeNode = buildPlaceNodeTool({
      projectId: run.projectId,
      writePatch: (patch) => {
        if (!uiWriter) throw new Error("canvas patch stream not ready");
        uiWriter.write({ type: CANVAS_PATCH_PART, id: patch.node.id, transient: true, data: patch });
      },
    });
    // update_brief (thumbnail journey) tells the open chat the brief changed, on the same stream.
    const updateBriefTool = buildUpdateBriefTool({
      conversationId,
      projectId: run.projectId,
      writeBriefUpdated: (data) => {
        if (!uiWriter) throw new Error("brief stream not ready");
        uiWriter.write({ type: BRIEF_UPDATED_PART, id: data.conversationId, transient: true, data });
      },
    });
    const result = streamText({
      model: agentModel.model,
      system: systemText,
      messages: (isNewUserTurn && retriedUserRowIndex === -1
        ? [...priorMessages, { role: "user", content: userParts }]
        : [...priorMessages]) as ModelMessage[],
      tools: {
        // generate_sketch is guarded by the thumbnail brief when there is one (step 7, sketch limit).
        ...buildAiSdkTools({
          wrapHandler: (name, handler) => (name === "generate_sketch" ? guardSketchHandler(conversationId, handler) : handler),
        }),
        ...V2_CLIENT_TOOLS,
        [PLACE_NODE_TOOL_NAME]: placeNode,
        [UPDATE_BRIEF_TOOL_NAME]: updateBriefTool,
      },
      // finish_turn closes the turn: stop right after its step instead of
      // paying for one more model call that would only restate the answer.
      stopWhen: [isStepCount(settings.agentMaxSteps), hasToolCall(FINISH_TURN_TOOL_NAME)],
      // ONLY the run's own signal (« Arrêter » → POST …/stop). The request's
      // signal is deliberately not passed: leaving the page must not stop the turn.
      abortSignal: run.abort.signal,
      providerOptions: {
        openrouter: {
          ...(modelInfo?.supportsThinking ? { reasoning: { effort: settings.agentReasoningEffort } } : {}),
          // With a brief the journey does its own research (research_topic): no web search on every call.
          ...(brief ? {} : webSearchProviderOptions()),
        },
      },
      // `responseMessages` is the aggregate across every step (not the deprecated
      // `response.messages`, last step only); `usage` is the whole-turn total.
      onEnd: async ({ responseMessages, usage, finishReason }) => {
        turnPersisted = true;
        persistAssistantTurn({
          conversationId,
          responseMessages,
          totalUsage: usage,
          finishReason,
          modelInfo,
        });
      },
      // Fires instead of onEnd on abort, before streamText emits its `abort`
      // chunk: saves the partial turn as interrupted, rebuilt from the steps.
      onAbort: ({ steps }) => {
        turnPersisted = true;
        const totalUsage = steps.reduce(
          (acc, s) => ({
            inputTokens: acc.inputTokens + (s.usage.inputTokens ?? 0),
            outputTokens: acc.outputTokens + (s.usage.outputTokens ?? 0),
          }),
          { inputTokens: 0, outputTokens: 0 },
        );
        persistAssistantTurn({
          conversationId,
          responseMessages: steps.flatMap((s) => s.response.messages),
          totalUsage,
          finishReason: "aborted",
          interrupted: true,
          modelInfo,
        });
      },
    });

    let endStatus: EndedRunStatus = "done";
    const modelStream = result.toUIMessageStream({
      // Per-chunk and log-only: it also fires for a routine `tool-error` part the
      // turn recovers from, so it must neither persist nor end the run.
      onError: (error) => {
        console.error("[agent v2] stream error:", error);
        return "An error occurred.";
      },
      // Called once for the whole turn, before the stream closes (so before
      // finishRun). A provider failure reaches neither streamText onEnd nor
      // onAbort: without this marker the user's message would stay unanswered.
      onEnd: ({ outcome }) => {
        endStatus = runStatusForOutcome(outcome.status);
        if (outcome.status !== "failed" || turnPersisted) return;
        try {
          persistAssistantTurn({
            conversationId,
            responseMessages: [],
            totalUsage: { inputTokens: 0, outputTokens: 0 },
            finishReason: "error",
            interrupted: true,
            modelInfo,
          });
        } catch (e) {
          // Never throw from here: `ai` would rethrow and cut the stream.
          console.error("[agent v2] failed to persist error marker:", e);
        }
      },
    });

    // The model's stream plus the canvas patches, in one stream. Built outside
    // `execute` so a throwing toUIMessageStream still frees the run (catch below).
    // No generated message id: like the model's stream alone, the `start` chunk
    // keeps no messageId (a continuation stays on the client's message).
    let modelStreamFailed = false;
    const uiStream = createUIMessageStream({
      execute: ({ writer }) => {
        uiWriter = writer;
        writer.merge(modelStream);
      },
      // A read failure of the model's stream (previously a pump read error).
      onError: (error) => {
        modelStreamFailed = true;
        console.error("[agent v2] run stream failed:", error);
        return "An error occurred.";
      },
      generateId: (() => undefined) as unknown as () => string,
    });

    // The server itself reads the turn to its end (not awaited by the response):
    // the model keeps running whatever happens to this HTTP request.
    void pumpRunStream(run, uiStream, () => (modelStreamFailed ? "error" : endStatus));
  } catch (e) {
    console.error("[agent v2] failed to start the turn:", e);
    // Stops a model call streamText may already have started.
    run.abort.abort();
    discardRun(run);
    return new Response(`Failed to start the agent turn: ${(e as Error).message}`, { status: 500 });
  }

  // The sender is just the first subscriber, like any reconnection. If Next
  // cancels this response, only the subscription goes away.
  return createUIMessageStreamResponse({ stream: subscribe(run) });
}
