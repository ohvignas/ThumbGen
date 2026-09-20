import { describe, it, expect } from "vitest";
import {
  compactDebugId,
  countDebugLogErrors,
  filterDebugLogEntries,
  formatDebugDelta,
  formatDebugLogDetails,
  formatIdList,
  inferDebugLogLevel,
  isWorkflowEvent,
} from "@/lib/debug-log-format";
import type { DebugLogEntry } from "@/lib/debug-log";

const row = (partial: Partial<DebugLogEntry> & Pick<DebugLogEntry, "scope" | "message">): DebugLogEntry => ({
  id: partial.id ?? 1,
  ts: partial.ts ?? "2026-09-19T00:54:03.142Z",
  origin: partial.origin ?? "client",
  data: partial.data,
  level: partial.level,
  scope: partial.scope,
  message: partial.message,
});

describe("inferDebugLogLevel", () => {
  it("counts real failures and ignores noisy info", () => {
    expect(inferDebugLogLevel(row({ scope: "generate", message: "job error" }))).toBe("error");
    expect(inferDebugLogLevel(row({ scope: "canvas-save", message: "404 stop retry" }))).toBe("error");
    expect(inferDebugLogLevel(row({ scope: "canvas-save", message: "POST 404", data: { error: "gone" } }))).toBe("error");
    expect(inferDebugLogLevel(row({ scope: "agent", message: "tool throw", data: { error: "boom" } }))).toBe("error");
    expect(inferDebugLogLevel(row({ scope: "agent", message: "tool end", data: { isError: true } }))).toBe("error");
    expect(inferDebugLogLevel(row({ scope: "agent", message: "apply_workflow missing image" }))).toBe("error");
    expect(inferDebugLogLevel(row({ scope: "agent", message: "apply_workflow invalid blueprint" }))).toBe("error");
    expect(inferDebugLogLevel(row({ scope: "generate", message: "HTTP error", data: { status: 502 } }))).toBe("error");

    expect(inferDebugLogLevel(row({ scope: "generate", message: "job cancelled" }))).toBe("warn");
    expect(inferDebugLogLevel(row({ scope: "canvas-load", message: "missing" }))).toBe("warn");
    expect(inferDebugLogLevel(row({ scope: "canvas-load", message: "keep local" }))).toBe("warn");
    expect(inferDebugLogLevel(row({ scope: "canvas-save", message: "queued (in-flight)" }))).toBe("warn");
    expect(inferDebugLogLevel(row({ scope: "agent", message: "apply_workflow conflict" }))).toBe("warn");

    expect(inferDebugLogLevel(row({ scope: "canvas-save", message: "ok" }))).toBe("success");
    expect(inferDebugLogLevel(row({ scope: "agent", message: "place_node wrote" }))).toBe("success");
    expect(inferDebugLogLevel(row({ scope: "generate", message: "start" }))).toBe("start");
    expect(inferDebugLogLevel(row({ scope: "chat", message: "finish_turn" }))).toBe("info");
    expect(inferDebugLogLevel(row({ scope: "generate", message: "cancelStuckGenerations none" }))).toBe("info");
  });

  it("honors an explicit level", () => {
    expect(inferDebugLogLevel(row({ scope: "chat", message: "finish_turn", level: "error" }))).toBe("error");
  });
});

describe("countDebugLogErrors", () => {
  it("counts only real failures in the current buffer", () => {
    const entries = [
      row({ scope: "generate", message: "start" }),
      row({ scope: "generate", message: "job error" }),
      row({ scope: "canvas-save", message: "ok" }),
      row({ scope: "canvas-save", message: "HTTP error", data: { status: 500 } }),
      row({ scope: "canvas-load", message: "missing" }),
      row({ scope: "generate", message: "job cancelled" }),
    ];
    expect(countDebugLogErrors(entries)).toBe(2);
  });
});

describe("isWorkflowEvent", () => {
  it("keeps generate, agent, chat, errors, and user load/save", () => {
    expect(isWorkflowEvent(row({ scope: "generate", message: "start" }))).toBe(true);
    expect(isWorkflowEvent(row({ scope: "generate", message: "job error" }))).toBe(true);
    expect(isWorkflowEvent(row({ scope: "generate", message: "done" }))).toBe(true);
    expect(isWorkflowEvent(row({ scope: "generate", message: "failed", data: { error: "boom" } }))).toBe(true);
    expect(isWorkflowEvent(row({ scope: "generate", message: "openai fallback", level: "warn" }))).toBe(true);
    expect(isWorkflowEvent(row({ scope: "agent", message: "tool start", data: { name: "ask_user" } }))).toBe(true);
    expect(isWorkflowEvent(row({ scope: "chat", message: "finish_turn" }))).toBe(true);
    expect(isWorkflowEvent(row({ scope: "canvas-save", message: "HTTP error", data: { status: 500 } }))).toBe(true);
    expect(isWorkflowEvent(row({ scope: "canvas-save", message: "POST 404", data: { error: "gone" } }))).toBe(true);
    expect(isWorkflowEvent(row({ scope: "canvas-load", message: "start", data: { reason: "replace" } }))).toBe(true);
    expect(isWorkflowEvent(row({ scope: "canvas-load", message: "ok", data: { reason: "replace" } }))).toBe(true);
    expect(isWorkflowEvent(row({ scope: "canvas-load", message: "ok", data: { reason: "resync" } }))).toBe(true);
    expect(isWorkflowEvent(row({ scope: "canvas-save", message: "ok", data: { reason: "manual" } }))).toBe(true);
  });

  it("hides autosave and poll process noise", () => {
    expect(isWorkflowEvent(row({ scope: "canvas-save", message: "db wrote" }))).toBe(false);
    expect(isWorkflowEvent(row({ scope: "canvas-save", message: "POST" }))).toBe(false);
    expect(isWorkflowEvent(row({ scope: "canvas-save", message: "start" }))).toBe(false);
    expect(isWorkflowEvent(row({ scope: "canvas-save", message: "ok" }))).toBe(false);
    expect(isWorkflowEvent(row({ scope: "canvas-save", message: "queued (in-flight)" }))).toBe(false);
    expect(isWorkflowEvent(row({ scope: "canvas-load", message: "GET" }))).toBe(false);
    expect(isWorkflowEvent(row({ scope: "canvas-load", message: "poll skip" }))).toBe(false);
    expect(isWorkflowEvent(row({ scope: "canvas-load", message: "poll reload" }))).toBe(false);
    expect(isWorkflowEvent(row({ scope: "canvas-load", message: "poll skip known" }))).toBe(false);
    expect(isWorkflowEvent(row({ scope: "canvas-load", message: "poll skip in-flight" }))).toBe(false);
    expect(isWorkflowEvent(row({ scope: "canvas-load", message: "start", data: { reason: "poll" } }))).toBe(false);
    expect(isWorkflowEvent(row({ scope: "canvas-load", message: "ok", data: { reason: "poll" } }))).toBe(false);
    expect(isWorkflowEvent(row({ scope: "canvas-save", message: "ok", data: { reason: "autosave" } }))).toBe(false);
  });

  it("filters the default view without dropping errors from the full count", () => {
    const entries = [
      row({ scope: "generate", message: "start" }),
      row({ scope: "canvas-save", message: "db wrote" }),
      row({ scope: "canvas-load", message: "GET" }),
      row({ scope: "canvas-save", message: "HTTP error", data: { status: 500 } }),
      row({ scope: "canvas-load", message: "poll skip known" }),
    ];
    expect(filterDebugLogEntries(entries, "workflow").map((entry) => entry.message)).toEqual(["start", "HTTP error"]);
    expect(filterDebugLogEntries(entries, "all")).toHaveLength(5);
    expect(countDebugLogErrors(entries)).toBe(1);
  });
});

describe("formatDebugLogDetails", () => {
  it("shows save/load fields without dumping every deleted UUID", () => {
    const deleted = Array.from({ length: 17 }, (_, i) => `aaaaaaaa-bbbb-cccc-dddd-${String(i).padStart(12, "0")}`);
    const text = formatDebugLogDetails({
      projectId: "11111111-2222-3333-4444-555555555555",
      nodes: 12,
      edges: 8,
      dirty: true,
      saving: false,
      reason: "poll",
      baseUpdatedAt: "2026-09-18 22:31:00.000",
      updatedAt: "2026-09-18 22:31:02.400",
      deletedNodeIds: deleted,
      reinjected: ["node-a", "node-b"],
      refreshed: ["node-c"],
      removed: [],
    });
    expect(text).toContain("projet 11111111");
    expect(text).toContain("nodes 12");
    expect(text).toContain("edges 8");
    expect(text).toContain("dirty");
    expect(text).toContain("saving=non");
    expect(text).toContain("reason poll");
    expect(text).toContain("deletedNodeIds 17 (aaaaaaaa, aaaaaaaa +15)");
    expect(text).not.toContain(deleted[5]);
    expect(text).toContain("reinjected 2 (node-a, node-b)");
    expect(text).toContain("refreshed 1 (node-c)");
    expect(text).toContain("removed 0");
    expect(text).toContain("Δ 2.4s");
  });

  it("shows generate and agent fields inline", () => {
    expect(
      formatDebugLogDetails({
        nodeId: "iv-generator",
        model: "openai/gpt-image-1",
        jobs: 2,
        produced: 1,
        variant: "A",
      }),
    ).toContain("nodeId iv-generator");
    expect(formatDebugLogDetails({ name: "place_node", ms: 42, isError: true })).toContain("isError");
    expect(
      formatDebugLogDetails({
        jobs: 2,
        produced: 1,
        failed: [{ variant: "B", error: "Requête bloquée par la modération de contenu" }],
      }),
    ).toContain("failed 1 (B)");
  });
});

describe("id helpers", () => {
  it("compacts UUIDs and lists a preview", () => {
    expect(compactDebugId("iv-prompt")).toBe("iv-prompt");
    expect(compactDebugId("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")).toBe("aaaaaaaa");
    expect(formatIdList(["aa", "bb", "cc", "dd"])).toBe("4 (aa, bb +2)");
    expect(formatDebugDelta("2026-09-18T10:00:00.000Z", "2026-09-18T10:00:00.180Z")).toBe("180ms");
  });
});
