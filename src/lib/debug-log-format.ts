import type { DebugLogEntry, DebugLogLevel, DebugScope } from "@/lib/debug-log";

const ID_LIST_KEYS = new Set([
  "deletedNodeIds",
  "deletedEdgeIds",
  "reinjected",
  "refreshed",
  "removed",
  "updated",
  "created",
]);

const ALWAYS_BOOL = new Set([
  "dirty",
  "saving",
  "loading",
  "isError",
  "inSequence",
  "force",
  "skippedReinject",
  "mergedExtras",
  "strippedDeleted",
  "livePatch",
  "abTest",
  "unchanged",
]);

const DETAIL_KEYS = [
  "projectId",
  "reason",
  "nodes",
  "edges",
  "local",
  "server",
  "dirty",
  "saving",
  "loading",
  "updatedAt",
  "baseUpdatedAt",
  "knownUpdatedAt",
  "serverUpdatedAt",
  "from",
  "to",
  "deletedNodeIds",
  "deletedEdgeIds",
  "reinjected",
  "refreshed",
  "removed",
  "created",
  "updated",
  "skippedReinject",
  "replayed",
  "stuckCleared",
  "mergedExtras",
  "strippedDeleted",
  "unchanged",
  "skip",
  "nodeId",
  "previewId",
  "model",
  "provider",
  "jobs",
  "produced",
  "failed",
  "variant",
  "images",
  "name",
  "ms",
  "isError",
  "addedEdges",
  "removedEdges",
  "inSequence",
  "force",
  "epoch",
  "status",
  "promptChars",
  "resolution",
  "variants",
  "numImages",
  "cleared",
  "error",
] as const;

const STAMP_KEYS = new Set([
  "updatedAt",
  "baseUpdatedAt",
  "knownUpdatedAt",
  "serverUpdatedAt",
  "from",
  "to",
]);

const ERROR_MESSAGE =
  /\b(error|failed|throw|invalid)\b|\b404\b|missing image|stop retry|http error/i;

export function parseDebugStamp(value: string): number {
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(value)) {
    return Date.parse(`${value.replace(" ", "T")}Z`);
  }
  return Date.parse(value);
}

export function compactDebugId(id: string): string {
  if (id.length <= 12) return id;
  if (/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id)) return id.slice(0, 8);
  return `${id.slice(0, 10)}…`;
}

export function formatDebugLogClock(ts: string): string {
  const ms = parseDebugStamp(ts);
  if (Number.isNaN(ms)) return ts;
  const date = new Date(ms);
  const pad = (n: number, width = 2) => String(n).padStart(width, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
}

export function formatDebugStampShort(value: string): string {
  const ms = parseDebugStamp(value);
  if (Number.isNaN(ms)) return value.length > 19 ? value.slice(11, 19) : value;
  const date = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function formatDebugDelta(from: string, to: string): string | null {
  const start = parseDebugStamp(from);
  const end = parseDebugStamp(to);
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  const ms = end - start;
  const abs = Math.abs(ms);
  const sign = ms < 0 ? "-" : "";
  if (abs < 1000) return `${sign}${abs}ms`;
  if (abs < 60_000) return `${sign}${(abs / 1000).toFixed(1)}s`;
  return `${sign}${Math.round(abs / 1000)}s`;
}

export function formatIdList(value: unknown, maxPreview = 2): string | null {
  if (!Array.isArray(value)) return null;
  const ids = value.filter((item): item is string => typeof item === "string");
  if (ids.length === 0) return "0";
  const preview = ids.slice(0, maxPreview).map(compactDebugId);
  const extra = ids.length > maxPreview ? ` +${ids.length - maxPreview}` : "";
  return `${ids.length} (${preview.join(", ")}${extra})`;
}

export function inferDebugLogLevel(entry: Pick<DebugLogEntry, "message" | "data" | "level">): DebugLogLevel {
  if (entry.level) return entry.level;
  const data = entry.data ?? {};
  const message = entry.message;
  const lower = message.toLowerCase();

  if (data.isError === true) return "error";
  if (typeof data.status === "number" && data.status >= 400) return "error";
  if (typeof data.error === "string" && data.error.trim()) return "error";

  if (/\bcancel/.test(lower) && !/stuck/.test(lower)) return "warn";

  if (ERROR_MESSAGE.test(message)) return "error";

  if (
    /\b(conflict|skip|superseded|queued|ignored|missing)\b/.test(lower) ||
    /keep local/i.test(message)
  ) {
    return "warn";
  }

  if (/^(ok|wrote|done|applied|db wrote)$/i.test(message) || /\b(wrote|applied|done)\b/.test(lower)) {
    return "success";
  }

  if (/^(GET|POST)$/.test(message) || /\bstart\b/.test(lower) || /poll reload/i.test(message)) {
    return "start";
  }

  return "info";
}

export function isDebugLogError(entry: Pick<DebugLogEntry, "message" | "data" | "level">): boolean {
  return inferDebugLogLevel(entry) === "error";
}

export function countDebugLogErrors(entries: readonly Pick<DebugLogEntry, "message" | "data" | "level">[]): number {
  return entries.reduce((count, entry) => count + (isDebugLogError(entry) ? 1 : 0), 0);
}

export type DebugLogsView = "workflow" | "all";

const USER_LOAD_REASONS = new Set(["replace", "resync"]);
const PROCESS_SAVE_REASONS = new Set(["autosave", "poll", "debounce"]);

function entryReason(entry: Pick<DebugLogEntry, "data">): string | undefined {
  const reason = entry.data?.reason;
  return typeof reason === "string" && reason ? reason : undefined;
}

/**
 * Default Logs view: generation, agent/chat, real errors, and a user opening
 * or restoring a project. Autosave + poll GET/skip/reload stay in the buffer
 * but are process noise.
 */
export function isWorkflowEvent(
  entry: Pick<DebugLogEntry, "scope" | "message" | "data" | "level">,
): boolean {
  if (isDebugLogError(entry)) return true;
  if (entry.scope === "generate" || entry.scope === "agent" || entry.scope === "chat") return true;

  const reason = entryReason(entry);
  if (entry.scope === "canvas-load") {
    return reason != null && USER_LOAD_REASONS.has(reason);
  }
  if (entry.scope === "canvas-save") {
    return reason != null && !PROCESS_SAVE_REASONS.has(reason);
  }
  return false;
}

export function filterDebugLogEntries<T extends Pick<DebugLogEntry, "scope" | "message" | "data" | "level">>(
  entries: readonly T[],
  view: DebugLogsView,
): T[] {
  if (view === "all") return entries.slice();
  return entries.filter(isWorkflowEvent);
}

function formatDetailValue(key: string, value: unknown): string | null {
  if (value == null) return null;
  if (ID_LIST_KEYS.has(key) && Array.isArray(value)) {
    const list = formatIdList(value);
    return list == null ? null : `${key} ${list}`;
  }
  if (typeof value === "boolean") {
    if (!value && !ALWAYS_BOOL.has(key)) return null;
    return value ? key : `${key}=non`;
  }
  if (key === "failed" && Array.isArray(value)) {
    const variants = value.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const variant = (item as { variant?: unknown }).variant;
      return typeof variant === "string" && variant ? [variant] : [];
    });
    if (variants.length > 0) return `failed ${variants.length} (${variants.join(", ")})`;
    return value.length > 0 ? `failed ${value.length}` : null;
  }
  if (key === "projectId" && typeof value === "string") return `projet ${compactDebugId(value)}`;
  if ((key === "nodeId" || key === "previewId") && typeof value === "string") {
    return `${key} ${compactDebugId(value)}`;
  }
  if (STAMP_KEYS.has(key) && typeof value === "string") {
    return `${key} ${formatDebugStampShort(value)}`;
  }
  if (typeof value === "number") return `${key} ${value}`;
  if (typeof value === "string") {
    if (/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value)) return `${key} ${compactDebugId(value)}`;
    const text = value.length > 64 ? `${value.slice(0, 63)}…` : value;
    return `${key} ${text}`;
  }
  if (Array.isArray(value)) {
    const list = formatIdList(value);
    return list == null ? `${key} ${value.length}` : `${key} ${list}`;
  }
  return null;
}

export function debugLogDetailParts(data?: Record<string, unknown>): string[] {
  if (!data) return [];
  const parts: string[] = [];
  const seen = new Set<string>();
  for (const key of DETAIL_KEYS) {
    if (!(key in data)) continue;
    const text = formatDetailValue(key, data[key]);
    if (!text) continue;
    parts.push(text);
    seen.add(key);
  }
  const base = typeof data.baseUpdatedAt === "string" ? data.baseUpdatedAt : null;
  const next = typeof data.updatedAt === "string" ? data.updatedAt : null;
  if (base && next) {
    const delta = formatDebugDelta(base, next);
    if (delta) parts.push(`Δ ${delta}`);
  } else if (typeof data.from === "string" && typeof data.to === "string") {
    const delta = formatDebugDelta(data.from, data.to);
    if (delta) parts.push(`Δ ${delta}`);
  }
  for (const [key, value] of Object.entries(data)) {
    if (seen.has(key) || DETAIL_KEYS.includes(key as (typeof DETAIL_KEYS)[number])) continue;
    if (value == null || typeof value === "object") continue;
    const text = formatDetailValue(key, value);
    if (text) parts.push(text);
  }
  return parts;
}

export function formatDebugLogDetails(data?: Record<string, unknown>): string {
  return debugLogDetailParts(data).join(" · ");
}

export const DEBUG_SCOPE_LABEL: Record<DebugScope, string> = {
  "canvas-load": "chargement",
  "canvas-save": "sauvegarde",
  generate: "génération",
  agent: "agent",
  chat: "chat",
};

export const DEBUG_LEVEL_LABEL: Record<DebugLogLevel, string> = {
  error: "erreur",
  warn: "attention",
  success: "ok",
  start: "en cours",
  info: "info",
};
