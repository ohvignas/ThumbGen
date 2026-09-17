import { NextRequest } from "next/server";
import { streamText, isStepCount, hasToolCall, type ModelMessage } from "ai";
import { getOpenRouterProvider } from "./openrouter-provider";
import { buildAiSdkTools } from "./tool-adapter";
import { V2_CLIENT_TOOLS } from "./browser-client-tools";
import { webSearchProviderOptions } from "./web-search-tool";
import { persistAssistantTurn } from "./persist-turn";
import { FINISH_TURN_TOOL_NAME } from "@/lib/agent/finish-turn";
import { buildSystemMessages } from "@/lib/agent/system-prompt";
import { appendMessage, listMessages } from "@/lib/agent/conversation/store";
import { generateAndPersistTitle } from "@/lib/agent/conversation/auto-title";
import { resolveImageSource } from "@/lib/agent/tools/_helpers/image-source";
import { getTypedSettings } from "@/lib/settings";
import { getModelById } from "@/lib/agent/models";
import { loadAgentPromptPrefs } from "@/lib/agent/prompt-prefs";
import { startGcLoop } from "@/lib/agent/gc";

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

const CLIENT_TOOL_NAMES = new Set(["request_user_image", "request_user_sketch"]);

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

export async function postV2(req: NextRequest): Promise<Response> {
  // `messages` here is the wire shape @ai-sdk/react's useChat/DefaultChatTransport
  // actually sends (the full UIMessage[] the client holds) — there is no
  // `message` (singular) field on the request; only the LAST entry (the new
  // turn) is used below, since prior history is reconstructed from the DB a
  // few lines down via listMessages(conversationId). `attachments` is a
  // sibling top-level field (not part of any UIMessage) carrying this app's
  // own `stored:<id>`-style image references — see AttachButton.tsx /
  // resolveImageSource. Deliberately NOT using AI SDK's own file-part
  // attachment mechanism (Plan 2's Task 7 decision).
  const body = (await req.json().catch(() => null)) as
    | {
        conversation_id?: string;
        project_id?: string;
        messages?: Array<{
          role: string;
          parts?: Array<{
            type: string;
            text?: string;
            // Present on tool parts only — read on the tool-continuation
            // path below (Task 11), where `lastMessage` is the ASSISTANT
            // message whose client-tool part (request_user_image /
            // request_user_sketch) was just resolved client-side via
            // useChat's addToolOutput (PendingUiAction.tsx / ChatPanel.tsx).
            toolCallId?: string;
            state?: string;
            output?: unknown;
            errorText?: string;
          }>;
        }>;
        attachments?: Array<{ type: "image"; source: string }>;
        canvas_snapshot?: unknown;
      }
    | null;

  if (!body?.conversation_id || !body?.project_id) {
    return new Response("Missing conversation_id or project_id", { status: 400 });
  }

  const provider = getOpenRouterProvider();
  if (!provider) {
    return new Response(
      "Clé OpenRouter non configurée. Ajoute-la dans Réglages → Connexions des modèles.",
      { status: 400 },
    );
  }

  const settings = getTypedSettings();
  const modelId = settings.agentModel;
  const modelInfo = getModelById(modelId);
  const conversationId = body.conversation_id;

  // Everything below is pre-stream setup: attachment resolution and prior-
  // history reconstruction, both of which read data supplied by (or on
  // behalf of) the client and can throw on bad input — a stale/invalid
  // attachment reference (resolveImageSource) or a conversation row that
  // doesn't parse as JSON. Left unguarded, either escapes as an unhandled
  // 500 with a stack trace exposed to the client, unlike v1's call site
  // (the v1 branch of POST in src/app/api/agent/chat/route.ts), which wraps
  // its whole loop in try/catch and degrades to an SSE `error` event.
  let priorMessages: unknown[];
  let systemText: string;
  let userParts: Array<
    { type: "text"; text: string } | { type: "file"; mediaType: string; data: string }
  >;

  // `body.messages.at(-1)` is a fresh user turn for a NORMAL send, but NOT
  // for the auto-continuation `sendAutomaticallyWhen` fires once
  // PendingUiAction.tsx resolves a client tool (request_user_image /
  // request_user_sketch) via useChat's addToolOutput (ChatPanel.tsx) — there,
  // `this.state.messages` (the full client-side array @ai-sdk/react's
  // useChat sends as `body.messages`) ends with the ASSISTANT message whose
  // tool part just got resolved, not a new user message. Treating that as a
  // fresh user turn would silently persist a spurious empty user row and
  // hand streamText a `[...priorMessages, {role:"user",content:[]}]` with a
  // bogus empty turn tacked on. Verified via the real addToolOutput call
  // path (node_modules/ai/dist/index.js) during Task 3's review — see
  // Task 11's brief header note (bugs #1/#2).
  const lastMessage = body.messages?.at(-1);
  const isNewUserTurn = lastMessage?.role === "user";

  try {
    userParts = [];
    if (isNewUserTurn) {
      // Concatenate the new turn's text part(s) — useChat's sendMessage({text})
      // produces a single { type: "text", text } part per call, but this stays
      // defensive against multiple text parts rather than assuming exactly one.
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

      // Checked BEFORE appending the new user row below, matching v1's exact
      // isFirstTurn logic (loop.ts, pre-cutover) — an empty conversation gets
      // exactly one auto-title attempt, on its first turn. Fire-and-forget:
      // does not block the model call below (see auto-title.ts's own header
      // comment on why this doesn't need to be awaited).
      const priorRowsForThisTurn = listMessages(conversationId);
      const isFirstTurn = priorRowsForThisTurn.length === 0;

      // Auto-resolve any pending request_user_image/request_user_sketch the
      // user is about to send a new message past instead of answering — see
      // findAbandonedClientToolCalls's own doc comment for why this is
      // required, not just tidy. Persisted BEFORE the new user row so the
      // conversation's turn structure (tool-call always immediately followed
      // by a tool-result) stays valid the moment this request completes, not
      // just eventually.
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

      appendMessage({
        conversation_id: conversationId,
        role: "user",
        content_json: JSON.stringify([{ role: "user", content: userParts }]),
        interrupted: 0,
        total_input_tokens: 0,
        total_output_tokens: 0,
        cost_estimate: 0,
      });

      if (isFirstTurn && lastMessageText.trim() && settings.agentAutoTitle) {
        void generateAndPersistTitle(conversationId, lastMessageText);
      }
    } else {
      // Tool-continuation: persist the client's resolution as its own
      // `role:"tool"` ModelMessage row, separate from the assistant's
      // tool-call row (already persisted by that turn's own onEnd before it
      // paused for client input). This is NOT optional scaffolding-avoidance
      // — two things make it required, not just tidy:
      //   1. rowsToUIMessages (Task 4) already expects a tool-result to
      //      arrive in a row separate from its matching tool-call row (see
      //      its own header comment) and folds them back together by
      //      toolCallId when history is reloaded.
      //   2. `streamText` below validates `messages` at runtime against
      //      `ai`'s real `modelMessageSchema` (confirmed reading
      //      node_modules/ai/dist/index.js's `standardizePrompt` /
      //      `toolResultPartSchema`) — a tool-result's `output` must be the
      //      wrapped `{type:"json"|"text"|...,value}` form, not a bare
      //      passthrough of the client's raw result object. Confirmed
      //      against a real persisted row (`sqlite3 data/thumbgen.db`) that
      //      a genuine server-tool result is stored exactly this way
      //      (`output:{type:"content",value:[...]}`). Without this wrapper,
      //      the very NEXT turn's `priorMessages` (built from this row) would
      //      fail that validation and streamText would throw
      //      InvalidPromptError instead of continuing.
      // Only `request_user_image`/`request_user_sketch` (the two client
      // tools PendingUiAction.tsx ever resolves — matching V2_CLIENT_TOOLS'
      // exclusion of request_user_sketch from what the model can actually
      // call) are considered here, so an already-persisted SERVER tool
      // result elsewhere on the same message is never re-picked-up/
      // duplicated.
      //
      // A continuation's stream can APPEND further work onto the SAME
      // assistant UIMessage it resumed (confirmed in
      // node_modules/ai/dist/index.js's createStreamingUIMessageState,
      // which reuses `lastMessage` when its role is "assistant" and the
      // trigger is "submit-message") — e.g. the model answers call1's
      // resolution and immediately calls request_user_image again (call2)
      // on that same message. When call2 is later resolved,
      // `lastMessage.parts` then contains BOTH call2's freshly-resolved
      // part AND call1's part, which is STILL "output-available" from
      // before. Filtering on state alone would re-persist call1's result a
      // second time, no longer immediately following the assistant message
      // that made call1 in `priorMessages` — providers reject that, and
      // since nothing ever deletes rows, every later turn in the
      // conversation replays the same malformed history. So the server —
      // not the client — is the authoritative dedup boundary: exclude any
      // resolved part whose toolCallId already has a persisted tool-result
      // somewhere in this conversation's rows.
      const alreadyPersistedToolCallIds = collectResolvedToolCallIds(listMessages(conversationId));

      const resolvedClientToolParts = (lastMessage?.parts ?? []).filter(
        (p): p is { type: string; toolCallId: string; state: string; output?: unknown; errorText?: string } =>
          (p.type === "tool-request_user_image" || p.type === "tool-request_user_sketch") &&
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
        // Defense-in-depth: this should be unreachable now that ChatPanel.tsx's
        // sendAutomaticallyWhen only fires for a message whose last step
        // includes an actual client-tool completion (request_user_image /
        // request_user_sketch) — see lastAssistantMessageIsCompleteWithClientToolCalls
        // there. Without this guard, a continuation with zero resolved
        // client-tool parts (e.g. a stale client still running the old,
        // unscoped predicate, or a future regression) would silently fall
        // through to streamText below and re-run the model for up to
        // agentMaxSteps more steps with nothing new to respond to. Return early
        // instead, matching this file's other guard-clause responses.
        return new Response(
          "No client-tool resolution found in this continuation; nothing to resume.",
          { status: 400 },
        );
      }
    }

    // Every prior row is assumed to already be ModelMessage-shaped — true
    // once scripts/migrate-chat-messages-to-uimessage.ts has run for real
    // (Plan 2's cutover sequencing: migrate, THEN flip to v2, THEN swap
    // the frontend — v2 is now the only backend). That assumption doesn't hold for a
    // conversation that still carries old v1 Anthropic-block-shaped rows
    // (see persist-turn.ts's header comment — the two JSON shapes are NOT
    // interchangeable), so guard it explicitly rather than silently feeding
    // malformed history into streamText and letting it fail with an opaque
    // provider error: a ModelMessage always carries a `role` key, an
    // Anthropic content block never does.
    //
    // On a normal send, the row just appended above (the new user turn) is
    // excluded here and re-added below from the in-memory `userParts`
    // instead (avoids re-parsing the JSON we just wrote). On a tool-
    // continuation there's nothing to re-add afterward — the freshly
    // appended tool-result row (if any) IS the last row and belongs in
    // `priorMessages` as-is, so nothing is sliced off.
    const priorRows = isNewUserTurn ? listMessages(conversationId).slice(0, -1) : listMessages(conversationId);
    priorMessages = [];
    for (const row of priorRows) {
      const parsed: unknown = JSON.parse(row.content_json);
      const looksMigrated =
        Array.isArray(parsed) &&
        parsed.every((m) => typeof m === "object" && m !== null && "role" in (m as Record<string, unknown>));
      if (!looksMigrated) {
        return new Response(
          "This conversation has messages in the old (pre-migration) format and can't " +
            "be continued on the new agent backend. Run scripts/migrate-chat-messages-to-uimessage.ts " +
            "first, then retry.",
          { status: 400 },
        );
      }
      priorMessages.push(...normalizeStaleToolResultFileData(parsed as unknown[]));
    }

    const systemBlocks = buildSystemMessages(body.canvas_snapshot, body.project_id, loadAgentPromptPrefs());
    systemText = systemBlocks.map((b) => b.text).join("\n\n");
  } catch (e) {
    return new Response(`Failed to prepare the conversation: ${(e as Error).message}`, { status: 400 });
  }

  // Guards the stream-level onError/onEnd fallback below against
  // double-persisting: streamText's OWN onEnd only skips firing for
  // NoOutputGeneratedError specifically — any other failure that happens
  // after at least one step already produced output fires BOTH the
  // per-chunk onError (used only for logging below, not persistence — see
  // the toUIMessageStreamResponse() call) AND this onEnd, for the SAME
  // turn. Confirmed against real data: conversation 71150f5b-... has row
  // 153 (empty, interrupted:1) and row 154 (the full, real 280KB response)
  // both persisted from ONE request. Set true at the top of streamText's
  // own onEnd/onAbort so the stream-level fallback never fires against a
  // turn that already got a proper row.
  let turnPersisted = false;

  const result = streamText({
    model: provider(modelId),
    system: systemText,
    // No new user message is appended on a tool-continuation (isNewUserTurn
    // false) — `priorMessages` alone (assistant tool-call + the freshly
    // persisted tool-result row above) is the correct prompt; streamText
    // just resumes from where the model paused.
    messages: (isNewUserTurn
      ? [...priorMessages, { role: "user", content: userParts }]
      : [...priorMessages]) as ModelMessage[],
    tools: { ...buildAiSdkTools(), ...V2_CLIENT_TOOLS },
    // finish_turn closes the turn: stop right after its step instead of
    // paying for one more model call that would only restate the answer.
    stopWhen: [isStepCount(settings.agentMaxSteps), hasToolCall(FINISH_TURN_TOOL_NAME)],
    // v1 checks abort only at the outer-iteration and token-streaming
    // boundaries, never inside the per-tool-call dispatch loop — a Stop
    // click lets any tool calls already in flight for the current batch
    // finish before the next iteration notices. Passing the request's own
    // signal here reproduces that same "finish current batch, then stop"
    // granularity as the starting point (whatever AI SDK's own abortSignal
    // handling does internally), not a tightened version — see spec §6.1.
    abortSignal: req.signal,
    providerOptions: {
      openrouter: {
        ...(modelInfo?.supportsThinking ? { reasoning: { effort: settings.agentReasoningEffort } } : {}),
        ...webSearchProviderOptions(),
      },
    },
    // `onFinish` is deprecated in ai@7.0.99 in favor of `onEnd` (identical
    // callback shape — `onFinish` is now a literal alias typed as
    // `StreamTextOnEndCallback`, not a separate event type). Read
    // `responseMessages` off the event directly rather than the deprecated
    // `response.messages` field: `response` there is itself a deprecated
    // alias for `finalStep.response`, so on a multi-step tool-calling turn
    // it would only carry the LAST step's messages. `responseMessages` is
    // the actual aggregate across every step of the turn. Same reasoning for
    // `usage` over the deprecated `totalUsage` alias (both carry the same
    // aggregated-across-all-steps numbers; `usage` is simply the current
    // name — see persist-turn.ts's FinishInfo.totalUsage for why aggregation
    // across steps is required in the first place).
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
    // Fires instead of onEnd when the stream is aborted (e.g. a Stop click)
    // — onEnd does NOT fire on abort. Without this, a Stop click during a v2
    // turn persisted nothing at all, unlike v1 (loop.ts:378-386), which
    // always writes a partial assistant row with interrupted:1. The abort
    // event (GenerateTextAbortEvent) carries no finishReason/usage/
    // responseMessages the way onEnd's event does — only `steps`, the
    // per-step results finished before the abort — so they're reconstructed
    // here by aggregating across those steps.
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

  // Force the underlying generation to keep running to completion — and
  // onEnd/onAbort to fire — even if the HTTP client disconnects (tab closed,
  // navigation away) mid-stream. Without this, toUIMessageStreamResponse()'s
  // stream gets cancelled on disconnect and neither callback runs, so
  // nothing is ever persisted for that turn. Not awaited: this runs
  // alongside the response stream, not before it.
  void result.consumeStream({
    onError: (error) => {
      console.error("[agent v2] consumeStream error:", error);
    },
  });

  // A genuine provider/API failure (bad request rejected by the model
  // backend, network error, etc. — NOT a user-initiated Stop, which is
  // onAbort above) takes neither the onEnd nor the onAbort path: streamText
  // encodes it as an `error` part inside the SSE stream instead of throwing,
  // so consumeStream's onError above never sees it either. Left unhandled,
  // toUIMessageStreamResponse()'s DEFAULT onError (`() => 'An error
  // occurred.'`) silently swallows the real error (masking it from both the
  // server console and the client) AND — critically — never calls
  // persistAssistantTurn, so the user's message that triggered this turn is
  // left in the DB with no assistant reply, forever. Every subsequent
  // request in that same conversation then has to replay that orphaned user
  // turn as part of its history; if the NEXT attempt also errors (same
  // transient provider issue, or a retry of the same bad input), it leaves
  // ANOTHER orphaned user message, and so on — a growing run of consecutive
  // un-replied user turns that make the conversation progressively more
  // likely to trip the model provider on every future request, with no way
  // to recover except abandoning the conversation.
  //
  // Persistence deliberately does NOT happen in `onError` below — `onError`
  // is the per-chunk stream handler, called for EVERY error-shaped part
  // that reaches the client, including a routine `tool-error` part
  // (!providerExecuted) from a tool that throws but lets the turn continue
  // normally afterward (e.g. search-youtube.ts on a non-OK YouTube response,
  // or resolveImageSource on a stale ref) — persisting there produced a
  // stray `interrupted:1` row ALONGSIDE the turn's real, successful
  // response (confirmed against real data: conversation 71150f5b-... has
  // both row 153, empty/interrupted, and row 154, the full real answer,
  // from one request). `onError` here is log-only. The stream-level `onEnd`
  // below (UIMessageStreamOnEndCallback — distinct from streamText's own
  // `onEnd` above; this one reports the whole request's outcome exactly
  // once) is where a still-unpersisted failure gets its `interrupted:1`
  // marker, guarded by `turnPersisted` so it never fires against a turn
  // streamText's own onEnd/onAbort already recorded.
  return result.toUIMessageStreamResponse({
    onError: (error) => {
      console.error("[agent v2] stream error:", error);
      return "An error occurred.";
    },
    onEnd: ({ outcome }) => {
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
        // Never let a persistence failure (e.g. this environment's
        // separately-tracked SQLite corruption) escape from here — `ai`
        // rethrows anything onError/onEnd throws, which would break the
        // HTTP stream into a truncated response instead of the clean
        // "An error occurred." frame the client already received.
        console.error("[agent v2] failed to persist error marker:", e);
      }
    },
  });
}
