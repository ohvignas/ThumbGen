import type { ChatStatus, UIMessage } from "ai";
import { toolLabel } from "@/lib/agent/tool-labels";
import { CLIENT_TOOL_NAME_SET } from "@/lib/agent/client-tools";
import {
  FINISH_TURN_TOOL_NAME,
  RESULT_ID_PREFIX,
  isVisualResultTool,
  parseFinishTurnInput,
  type FinishTurnInput,
} from "@/lib/agent/finish-turn";

/**
 * Pure model of one assistant message for the chat panel (chantier E): what
 * goes in the folded step list, what the answer is, which tool outputs are
 * shown as results, and the « Et maintenant » actions. Used for live and
 * reopened conversations alike.
 */

export type MessagePart = UIMessage["parts"][number];
export type ToolPart = Extract<MessagePart, { type: `tool-${string}` }>;

/** Client tools the chat resolves itself (PendingUiAction) — see src/lib/agent/client-tools.ts. */
export const CLIENT_TOOL_NAMES: ReadonlySet<string> = CLIENT_TOOL_NAME_SET;

export type ToolStatus = "running" | "done" | "error";

export type ReasoningStep = { kind: "reasoning"; id: string; text: string };
export type TextStep = { kind: "text"; id: string; text: string };
export type ToolStep = {
  kind: "tool";
  id: string;
  toolName: string;
  label: string;
  status: ToolStatus;
  errorText: string | null;
  part: ToolPart;
  /** Already shown under « Résultats »: the detail only points to it. */
  shownInResults: boolean;
};
export type TurnStep = ReasoningStep | TextStep | ToolStep;

export type NextAction =
  | { kind: "ask_agent"; label: string; message: string }
  | { kind: "focus_node"; label: string; nodeId: string };

/** Stored on reopened assistant messages by history-to-ui-messages.ts. */
export type TurnMetadata = { durationMs?: number; interrupted?: boolean };

export type AssistantTurn = {
  steps: TurnStep[];
  answer: string;
  results: ToolPart[];
  nextActions: NextAction[];
  pending: ToolPart[];
  durationMs: number | null;
  stepCount: number;
  interrupted: boolean;
  hasFinishTurn: boolean;
};

export type TurnError = { title: string; description: string };

export const INTERRUPTED_TURN_ERROR: TurnError = {
  title: "Tour interrompu",
  description: "L'agent s'est arrêté avant d'avoir fini.",
};

export function liveTurnError(message: string | null): TurnError {
  return { title: "Erreur", description: message?.trim() || "Une erreur est survenue." };
}

export function isBusyStatus(status: ChatStatus): boolean {
  return status === "submitted" || status === "streaming";
}

export function emptyAssistantTurn(): AssistantTurn {
  return {
    steps: [],
    answer: "",
    results: [],
    nextActions: [],
    pending: [],
    durationMs: null,
    stepCount: 0,
    interrupted: false,
    hasFinishTurn: false,
  };
}

export function isToolPart(part: MessagePart): part is ToolPart {
  return part.type.startsWith("tool-");
}

export function toolNameOf(part: ToolPart): string {
  return part.type.slice("tool-".length);
}

/** Error text carried by a tool output that is formally "output-available", or null. */
function errorTextOfOutput(output: unknown): string | null {
  if (!output || typeof output !== "object") return null;
  const o = output as Record<string, unknown>;
  // Reopened AI SDK error results: { type: "error-text" | "error-json", value }.
  if (o.type === "error-text" || o.type === "error-json") {
    return typeof o.value === "string" ? o.value : JSON.stringify(o.value ?? null);
  }
  // Live registry failures: ToolResult { isError: true, content: [{ type: "text", text }] }.
  if (o.isError === true) {
    const content = Array.isArray(o.content) ? (o.content as Array<{ type?: unknown; text?: unknown }>) : [];
    const first = content.find((c) => c?.type === "text" && typeof c.text === "string");
    return typeof first?.text === "string" ? first.text : "Erreur";
  }
  return null;
}

export function toolStatus(part: ToolPart): { status: ToolStatus; errorText: string | null } {
  if (part.state === "output-error") return { status: "error", errorText: part.errorText || "Erreur" };
  if (part.state === "output-denied") return { status: "error", errorText: "Refusé" };
  if (part.state === "output-available") {
    const errorText = errorTextOfOutput(part.output);
    return errorText === null ? { status: "done", errorText: null } : { status: "error", errorText };
  }
  // input-streaming, input-available and approval-* (the app doesn't use tool approvals today).
  return { status: "running", errorText: null };
}

export function readTurnMetadata(message: UIMessage): TurnMetadata {
  const metadata = message.metadata;
  if (!metadata || typeof metadata !== "object") return {};
  const { durationMs, interrupted } = metadata as Record<string, unknown>;
  const out: TurnMetadata = {};
  if (typeof durationMs === "number" && Number.isFinite(durationMs) && durationMs >= 0) out.durationMs = durationMs;
  if (interrupted === true) out.interrupted = true;
  return out;
}

function isPendingClientRequest(part: ToolPart): boolean {
  return CLIENT_TOOL_NAMES.has(toolNameOf(part)) && (part.state === "input-streaming" || part.state === "input-available");
}

/** Content items that carry an image: live ToolResult `image`, or a reopened `{ type: "content" }` file/media item. */
const IMAGE_ITEM_TYPES: ReadonlySet<string> = new Set(["image", "file", "file-data", "file-url", "image-data", "image-url"]);

function hasImageContent(output: unknown): boolean {
  if (!output || typeof output !== "object") return false;
  const o = output as Record<string, unknown>;
  // Live: ToolResult { content: [...] }. Reopened: tool-adapter's toModelOutput { type: "content", value: [...] }.
  const items = Array.isArray(o.content) ? o.content : o.type === "content" && Array.isArray(o.value) ? o.value : [];
  return items.some(
    (item) => !!item && typeof item === "object" && IMAGE_ITEM_TYPES.has(String((item as { type?: unknown }).type)),
  );
}

function isShowableResult(part: ToolPart): boolean {
  return (
    isVisualResultTool(toolNameOf(part)) &&
    part.state === "output-available" &&
    toolStatus(part).status === "done" &&
    hasImageContent(part.output)
  );
}

/** A finish_turn result id, tolerating a copied « result_id: » prefix. */
function normalizeResultId(id: string): string {
  const trimmed = id.trim();
  const prefix = RESULT_ID_PREFIX.trim(); // "result_id:"
  return trimmed.startsWith(prefix) ? trimmed.slice(prefix.length).trim() : trimmed;
}

function toNextAction(action: FinishTurnInput["next_actions"][number]): NextAction | null {
  if (action.kind === "ask_agent" && action.message) return { kind: "ask_agent", label: action.label, message: action.message };
  if (action.kind === "focus_node" && action.node_id) return { kind: "focus_node", label: action.label, nodeId: action.node_id };
  return null;
}

/** Answer of a turn that has steps but ended without text, finish_turn or failed tool. */
export const STOPPED_WITHOUT_ANSWER = "L'agent s'est arrêté sans réponse.";

function endedWithoutAnswer(parts: MessagePart[], stepTools: ToolPart[], pending: ToolPart[]): boolean {
  // Paused on a client request (or reopened up to its answered request): waiting, not stopped.
  if (pending.length > 0) return false;
  const lastTool = stepTools.at(-1);
  if (lastTool && CLIENT_TOOL_NAMES.has(toolNameOf(lastTool))) return false;
  return stepTools.length > 0 || parts.some((part) => part.type === "reasoning" && part.text.trim() !== "");
}

export function splitAssistantTurn(message: UIMessage): AssistantTurn {
  const parts = message.parts;
  const metadata = readTurnMetadata(message);

  let finish: FinishTurnInput | null = null;
  const pending: ToolPart[] = [];
  const stepToolIndexes = new Set<number>();
  const stepTools: ToolPart[] = [];
  let lastStepToolIndex = -1;
  const texts: Array<{ index: number; text: string }> = [];

  for (let index = 0; index < parts.length; index++) {
    const part = parts[index];
    if (part.type === "text") {
      if (part.text.trim() !== "") texts.push({ index, text: part.text.trim() });
      continue;
    }
    if (!isToolPart(part)) continue;
    if (toolNameOf(part) === FINISH_TURN_TOOL_NAME) {
      // Never a step; only a complete, valid input counts (the last one wins).
      if (part.state === "input-available" || part.state === "output-available") {
        finish = parseFinishTurnInput(part.input) ?? finish;
      }
      continue;
    }
    if (isPendingClientRequest(part)) {
      pending.push(part);
      continue;
    }
    stepToolIndexes.add(index);
    stepTools.push(part);
    lastStepToolIndex = index;
  }

  let answer = "";
  const answerTextIndexes = new Set<number>();
  if (finish) {
    answer = finish.summary;
  } else {
    const trailing = texts.filter((t) => t.index > lastStepToolIndex);
    const lastTool = stepTools.at(-1);
    const lastToolStatus = lastTool ? toolStatus(lastTool) : null;
    if (trailing.length > 0) {
      answer = trailing.map((t) => t.text).join("\n\n");
      for (const t of trailing) answerTextIndexes.add(t.index);
    } else if (lastTool && lastToolStatus?.status === "error") {
      answer = `Échec de l'étape « ${toolLabel(toolNameOf(lastTool))} » : ${lastToolStatus.errorText}`;
    } else if (texts.length > 0) {
      const last = texts[texts.length - 1];
      answer = last.text;
      answerTextIndexes.add(last.index);
    } else if (endedWithoutAnswer(parts, stepTools, pending)) {
      // E.g. the step limit was reached: say so instead of leaving the turn blank.
      answer = STOPPED_WITHOUT_ANSWER;
    }
  }

  let results: ToolPart[];
  if (finish) {
    const byId = new Map(stepTools.map((part) => [part.toolCallId, part]));
    results = [];
    for (const id of finish.results) {
      const part = byId.get(normalizeResultId(id));
      if (part && isShowableResult(part) && !results.includes(part)) results.push(part);
    }
    // Ids listed but none of them known: finish_turn was likely called in the same
    // step as the visual tool, before the model could read its result id.
    if (finish.results.length > 0 && results.length === 0) results = stepTools.filter(isShowableResult);
  } else {
    results = stepTools.filter(isShowableResult);
  }

  const steps: TurnStep[] = [];
  for (let index = 0; index < parts.length; index++) {
    const part = parts[index];
    const id = `${message.id}:${index}`;
    if (part.type === "reasoning") {
      if (part.text.trim() !== "") steps.push({ kind: "reasoning", id, text: part.text });
    } else if (part.type === "text") {
      if (part.text.trim() !== "" && !answerTextIndexes.has(index)) steps.push({ kind: "text", id, text: part.text.trim() });
    } else if (isToolPart(part) && stepToolIndexes.has(index)) {
      const toolName = toolNameOf(part);
      const { status, errorText } = toolStatus(part);
      steps.push({
        kind: "tool",
        id,
        toolName,
        label: toolLabel(toolName),
        status,
        errorText,
        part,
        shownInResults: results.includes(part),
      });
    }
  }

  const nextActions = finish
    ? finish.next_actions.map(toNextAction).filter((action): action is NextAction => action !== null)
    : [];

  return {
    steps,
    answer,
    results,
    nextActions,
    pending,
    durationMs: metadata.durationMs ?? null,
    stepCount: steps.length,
    interrupted: metadata.interrupted === true,
    hasFinishTurn: finish !== null,
  };
}

/** Label of the live step line, from the last part of the running message. */
export function currentStepLabel(message: UIMessage | undefined, status: ChatStatus): string {
  if (status === "submitted" || !message || message.role !== "assistant") return "Réfléchit";
  const last = message.parts.at(-1);
  if (!last) return "Réfléchit";
  if (last.type === "text") return "Rédige la réponse";
  if (isToolPart(last)) {
    return toolStatus(last).status === "running" ? toolLabel(toolNameOf(last)) : "Réfléchit";
  }
  return "Réfléchit";
}

export function formatTurnDuration(ms: number): string {
  const total = Math.max(1, Math.round(ms / 1000));
  if (total < 60) return `${total} s`;
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return seconds === 0 ? `${minutes} min` : `${minutes} min ${seconds} s`;
}

/** Live timer text, m:ss. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function stepCountLabel(count: number): string {
  return `${count} étape${count > 1 ? "s" : ""}`;
}

/** « 12 s · 4 étapes », or « 4 étapes » when the duration is unknown. */
export function turnHeaderLabel(turn: Pick<AssistantTurn, "durationMs" | "stepCount">): string {
  const steps = stepCountLabel(turn.stepCount);
  return turn.durationMs === null ? steps : `${formatTurnDuration(turn.durationMs)} · ${steps}`;
}

export type TurnDisplay = {
  mode: "progress" | "done";
  error: TurnError | null;
  showActions: boolean;
  canRetry: boolean;
};

/** How an assistant message renders given its place in the list and the chat status. */
export function turnDisplay(input: {
  isLast: boolean;
  status: ChatStatus;
  errorMessage: string | null;
  stoppedLive: boolean;
  interrupted: boolean;
}): TurnDisplay {
  if (input.isLast && isBusyStatus(input.status)) {
    return { mode: "progress", error: null, showActions: false, canRetry: false };
  }
  const error =
    input.isLast && input.status === "error"
      ? liveTurnError(input.errorMessage)
      : input.interrupted || (input.isLast && input.stoppedLive)
        ? INTERRUPTED_TURN_ERROR
        : null;
  return { mode: "done", error, showActions: input.isLast && error === null, canRetry: input.isLast && error !== null };
}
