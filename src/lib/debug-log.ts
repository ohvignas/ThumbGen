/**
 * Docker-friendly console logs, plus an in-app ring buffer so the user can
 * read / copy the same stream without opening Docker. Never pass API keys,
 * image bytes, prompts, or other secrets — ids, counts, statuses, and
 * durations only. A second redaction pass still strips anything that slips in.
 */
export type DebugScope = "agent" | "canvas-save" | "canvas-load" | "generate" | "chat";

export type DebugLogOrigin = "client" | "server";

export type DebugLogLevel = "error" | "warn" | "success" | "start" | "info";

export type DebugLogEntry = {
  id: number;
  ts: string;
  scope: DebugScope;
  message: string;
  data?: Record<string, unknown>;
  origin: DebugLogOrigin;
  level?: DebugLogLevel;
};

const MAX_ENTRIES = 800;

const SECRET_KEY =
  /api[_-]?key|authorization|password|passwd|secret|token|bearer|imagebase64|image_base64|private[_-]?key|openai[_-]?key|openrouter[_-]?key|perplexity[_-]?key|mcp[_-]?key|cookie/i;
const PROMPT_KEY = /^(prompt|negativePrompt|fullPrompt|systemPrompt|userPrompt)$/i;
const COUNT_KEY = /^(promptChars|summaryChars)$/;
const DATA_URL = /^data:[^;]*;base64,/i;
const LOOKS_LIKE_KEY = /^(sk-|or-|pk-|rk-|xox[baprs]-)[A-Za-z0-9_-]{10,}$/;
const LOOKS_LIKE_BYTES = /^[A-Za-z0-9+/=\s]{200,}$/;

type BufferState = {
  entries: DebugLogEntry[];
  nextId: number;
  listeners: Set<() => void>;
};

const GLOBAL_KEY = "__thumbgenDebugLogs";

function bufferState(): BufferState {
  const g = globalThis as typeof globalThis & { [GLOBAL_KEY]?: BufferState };
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = { entries: [], nextId: 1, listeners: new Set() };
  }
  return g[GLOBAL_KEY]!;
}

function originNow(): DebugLogOrigin {
  return typeof window === "undefined" ? "server" : "client";
}

function shouldRedactKey(key: string): boolean {
  if (COUNT_KEY.test(key)) return false;
  return SECRET_KEY.test(key) || PROMPT_KEY.test(key);
}

function redactString(value: string): string {
  if (DATA_URL.test(value) || value.startsWith("data:image")) return "[omitted image bytes]";
  if (LOOKS_LIKE_KEY.test(value)) return "[redacted]";
  if (value.length > 200 && LOOKS_LIKE_BYTES.test(value)) return "[omitted bytes]";
  return value;
}

export function redactDebugValue(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[omitted]";
  if (value == null) return value;
  if (typeof value === "string") return redactString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 80).map((item) => redactDebugValue(item, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = shouldRedactKey(key) ? "[redacted]" : redactDebugValue(item, depth + 1);
    }
    return out;
  }
  return String(value);
}

function projectIdOf(entry: DebugLogEntry): string | undefined {
  const data = entry.data;
  if (!data) return undefined;
  const id = data.projectId ?? data.pid;
  return typeof id === "string" && id ? id : undefined;
}

export function entryMatchesProject(entry: DebugLogEntry, projectId: string): boolean {
  const id = projectIdOf(entry);
  return !id || id === projectId;
}

function pushEntry(entry: DebugLogEntry): void {
  const state = bufferState();
  state.entries.push(entry);
  if (state.entries.length > MAX_ENTRIES) {
    state.entries.splice(0, state.entries.length - MAX_ENTRIES);
  }
  for (const listener of state.listeners) listener();
}

export function debugLog(
  scope: DebugScope,
  message: string,
  data?: Record<string, unknown>,
  level?: DebugLogLevel,
): void {
  const safe = data ? (redactDebugValue(data) as Record<string, unknown>) : undefined;
  pushEntry({
    id: bufferState().nextId++,
    ts: new Date().toISOString(),
    scope,
    message,
    ...(safe && Object.keys(safe).length > 0 ? { data: safe } : {}),
    origin: originNow(),
    ...(level ? { level } : {}),
  });
  if (safe) {
    console.log(`[${scope}] ${message}`, safe);
    return;
  }
  console.log(`[${scope}] ${message}`);
}

export function readDebugLogs(projectId?: string): DebugLogEntry[] {
  const all = bufferState().entries.slice();
  return projectId ? all.filter((entry) => entryMatchesProject(entry, projectId)) : all;
}

export function subscribeDebugLogs(listener: () => void): () => void {
  const listeners = bufferState().listeners;
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function resetDebugLogs(): void {
  const state = bufferState();
  state.entries.length = 0;
  state.nextId = 1;
}

export function mergeDebugLogs(client: DebugLogEntry[], server: DebugLogEntry[]): DebugLogEntry[] {
  const seen = new Set<string>();
  const out: DebugLogEntry[] = [];
  for (const entry of [...client, ...server]) {
    const key = `${entry.ts}\0${entry.scope}\0${entry.message}\0${entry.origin}\0${JSON.stringify(entry.data ?? null)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(entry);
  }
  out.sort((a, b) => a.ts.localeCompare(b.ts) || a.id - b.id);
  return out;
}

export function formatDebugLogs(entries: readonly DebugLogEntry[]): string {
  return entries
    .map((entry) => {
      const data = entry.data && Object.keys(entry.data).length > 0 ? ` ${JSON.stringify(entry.data)}` : "";
      return `${entry.ts} [${entry.scope}] [${entry.origin}] ${entry.message}${data}`;
    })
    .join("\n");
}
