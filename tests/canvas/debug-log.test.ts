import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  debugLog,
  entryMatchesProject,
  formatDebugLogs,
  mergeDebugLogs,
  readDebugLogs,
  redactDebugValue,
  resetDebugLogs,
  type DebugLogEntry,
} from "@/lib/debug-log";

beforeEach(() => {
  resetDebugLogs();
});

const row = (partial: Partial<DebugLogEntry> & Pick<DebugLogEntry, "scope" | "message">): DebugLogEntry => ({
  id: partial.id ?? 1,
  ts: partial.ts ?? "2026-09-19T00:00:00.000Z",
  origin: partial.origin ?? "client",
  data: partial.data,
  scope: partial.scope,
  message: partial.message,
});

describe("debugLog ring buffer", () => {
  it("keeps the [scope] console prefix and stores a redacted entry", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    debugLog("agent", "apply_workflow wrote", {
      projectId: "proj-1",
      apiKey: "sk-secret-value-1234567890",
      prompt: "FULL SECRET PROMPT",
      imageBase64: "data:image/png;base64,QUJDRA==",
      created: ["g-1"],
    });
    expect(spy.mock.calls[0][0]).toBe("[agent] apply_workflow wrote");
    expect(JSON.stringify(spy.mock.calls[0][1])).not.toContain("sk-secret");
    expect(JSON.stringify(spy.mock.calls[0][1])).not.toContain("FULL SECRET");
    expect(JSON.stringify(spy.mock.calls[0][1])).not.toContain("QUJDRA");
    spy.mockRestore();

    const entries = readDebugLogs("proj-1");
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ scope: "agent", message: "apply_workflow wrote", origin: "server" });
    debugLog("canvas-save", "HTTP error", { projectId: "proj-1", status: 500 }, "error");
    expect(readDebugLogs("proj-1")[1]).toMatchObject({ message: "HTTP error", level: "error" });
    const text = formatDebugLogs(entries);
    expect(text).toContain("[agent]");
    expect(text).toContain("apply_workflow wrote");
    expect(text).not.toContain("sk-secret");
    expect(text).not.toContain("FULL SECRET");
    expect(text).not.toContain("QUJDRA");
  });

  it("includes logs without a projectId when filtering, and drops other projects", () => {
    debugLog("chat", "finish_turn", { summaryChars: 12 });
    debugLog("canvas-save", "ok", { projectId: "proj-a" });
    debugLog("canvas-load", "ok", { projectId: "proj-b" });
    expect(readDebugLogs("proj-a").map((entry) => entry.message)).toEqual(["finish_turn", "ok"]);
    expect(entryMatchesProject(row({ scope: "generate", message: "start" }), "proj-a")).toBe(true);
  });

  it("merges client and server streams without dropping lines", () => {
    const client = [row({ id: 1, ts: "2026-09-19T00:00:02.000Z", origin: "client", scope: "generate", message: "start" })];
    const server = [
      row({ id: 1, ts: "2026-09-19T00:00:01.000Z", origin: "server", scope: "agent", message: "tool start", data: { name: "place_node" } }),
      row({ id: 2, ts: "2026-09-19T00:00:02.000Z", origin: "server", scope: "generate", message: "start" }),
    ];
    const merged = mergeDebugLogs(client, server);
    expect(merged.map((entry) => `${entry.origin}:${entry.message}`)).toEqual([
      "server:tool start",
      "client:start",
      "server:start",
    ]);
    expect(formatDebugLogs(merged)).toContain("place_node");
  });
});

describe("redactDebugValue", () => {
  it("strips keys, API tokens and data URLs", () => {
    expect(redactDebugValue({ openrouterApiKey: "or-abcdefghij123", promptChars: 40 })).toEqual({
      openrouterApiKey: "[redacted]",
      promptChars: 40,
    });
    expect(redactDebugValue("data:image/png;base64,AAAA")).toBe("[omitted image bytes]");
    expect(redactDebugValue("sk-abcdefghijklmnopqrstuvwxyz")).toBe("[redacted]");
  });
});
