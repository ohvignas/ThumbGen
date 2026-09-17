import { describe, it, expect } from "vitest";
import {
  EMPTY_RUNS,
  RUNS_POLL_ACTIVE_MS,
  RUNS_POLL_IDLE_MS,
  attentionToastTitle,
  markSeenEntries,
  markToasted,
  nextPollDelay,
  openProjectIdFromPath,
  parseRunsMemory,
  pickConversationId,
  pruneRunsMemory,
  runIndicatorState,
  toastsToFire,
  unseenAttentions,
} from "@/components/agent-runs/agent-runs-model";
import type { AgentRunsSnapshot, AttentionEntry } from "@/lib/agent/v2/run-types";

const attention = (conversationId: string, projectId: string, endedAt: number, kind: AttentionEntry["kind"] = "finished"): AttentionEntry => ({
  conversationId,
  projectId,
  projectName: `Projet ${projectId}`,
  kind,
  endedAt,
});
const snapshot = (partial: Partial<AgentRunsSnapshot>): AgentRunsSnapshot => ({ ...EMPTY_RUNS, ...partial });
const emptyMemory = parseRunsMemory(null);

describe("agent runs model", () => {
  it("polls every 3 s while a turn runs, every 30 s otherwise", () => {
    expect(nextPollDelay(EMPTY_RUNS)).toBe(RUNS_POLL_IDLE_MS);
    expect(nextPollDelay(snapshot({ running: [{ conversationId: "c", projectId: "p", projectName: "P", startedAt: 1 }] }))).toBe(RUNS_POLL_ACTIVE_MS);
  });

  it("reads a damaged memory as empty", () => {
    expect(parseRunsMemory("{oops")).toEqual({ seen: {}, toasted: {} });
    expect(parseRunsMemory("null")).toEqual({ seen: {}, toasted: {} });
    expect(parseRunsMemory(JSON.stringify({ seen: { c1: 5, bad: "x" } }))).toEqual({ seen: { c1: 5 }, toasted: {} });
  });

  it("an attention is unseen until marked with its endedAt; a later end is unseen again", () => {
    const s = snapshot({ attention: [attention("c1", "p1", 10)] });
    expect(unseenAttentions(s, emptyMemory)).toHaveLength(1);
    const seen = markSeenEntries(emptyMemory, s.attention);
    expect(unseenAttentions(s, seen)).toHaveLength(0);
    expect(markSeenEntries(seen, s.attention)).toBe(seen);
    expect(unseenAttentions(snapshot({ attention: [attention("c1", "p1", 20)] }), seen)).toHaveLength(1);
  });

  it("toasts each unseen attention once, never for the open miniature", () => {
    const s = snapshot({ attention: [attention("c1", "p1", 10), attention("c2", "p2", 11, "question")] });
    expect(toastsToFire(s, emptyMemory, "p2").map((entry) => entry.conversationId)).toEqual(["c1"]);
    const toasted = markToasted(emptyMemory, toastsToFire(s, emptyMemory, null));
    expect(toastsToFire(s, toasted, null)).toEqual([]);
    expect(markToasted(toasted, [])).toBe(toasted);
  });

  it("prunes memory entries whose attention is gone", () => {
    const memory = { seen: { c1: 10, old: 3 }, toasted: { old: 3 } };
    const s = snapshot({ attention: [attention("c1", "p1", 10)] });
    expect(pruneRunsMemory(memory, s)).toEqual({ seen: { c1: 10 }, toasted: {} });
    const clean = { seen: { c1: 10 }, toasted: {} };
    expect(pruneRunsMemory(clean, s)).toBe(clean);
  });

  it("writes the three toast texts", () => {
    expect(attentionToastTitle(attention("c", "p", 1, "finished"))).toBe("L'agent a fini — Projet p");
    expect(attentionToastTitle(attention("c", "p", 1, "error"))).toBe("L'agent s'est arrêté sur une erreur — Projet p");
    expect(attentionToastTitle(attention("c", "p", 1, "question"))).toBe("L'agent te pose une question — Projet p");
  });

  it("finds the open miniature in the path", () => {
    expect(openProjectIdFromPath("/m/proj_123")).toBe("proj_123");
    expect(openProjectIdFromPath("/bibliotheque")).toBeNull();
    expect(openProjectIdFromPath(null)).toBeNull();
  });

  it("computes the indicator for one project or for all", () => {
    const running = snapshot({ running: [{ conversationId: "c1", projectId: "p1", projectName: "P", startedAt: 1 }] });
    expect(runIndicatorState(running, [], "p1")).toBe("running");
    expect(runIndicatorState(running, [], "p2")).toBeNull();
    expect(runIndicatorState(running, [])).toBe("running");
    expect(runIndicatorState(EMPTY_RUNS, [attention("c2", "p2", 5)], "p2")).toBe("attention");
    expect(runIndicatorState(EMPTY_RUNS, [attention("c2", "p2", 5)])).toBe("attention");
    expect(runIndicatorState(EMPTY_RUNS, [])).toBeNull();
  });

  it("opens the running conversation first, then the newest attention, then the most recent", () => {
    const list = [{ id: "recent" }, { id: "busy" }, { id: "ended" }, { id: "older-ended" }];
    const s = snapshot({
      running: [
        { conversationId: "busy", projectId: "p1", projectName: "P", startedAt: 5 },
        { conversationId: "other-project", projectId: "p2", projectName: "Q", startedAt: 9 },
      ],
      attention: [attention("older-ended", "p1", 3), attention("ended", "p1", 7)],
    });
    expect(pickConversationId(list, s, "p1")).toBe("busy");
    expect(pickConversationId(list, snapshot({ attention: s.attention }), "p1")).toBe("ended");
    expect(pickConversationId(list, EMPTY_RUNS, "p1")).toBe("recent");
    expect(pickConversationId([], s, "p1")).toBeNull();
  });
});
