import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AgentRunsContext, type AgentRunsContextValue } from "@/components/agent-runs/AgentRunsProvider";
import { RunIndicator } from "@/components/agent-runs/RunIndicator";
import { EMPTY_RUNS } from "@/components/agent-runs/agent-runs-model";

const value = (partial: Partial<AgentRunsContextValue>): AgentRunsContextValue => ({
  snapshot: EMPTY_RUNS,
  unseen: [],
  refreshRuns: async () => EMPTY_RUNS,
  markSeen: () => {},
  unseenOnArrival: () => [],
  ...partial,
});

const render = (context: AgentRunsContextValue, projectId?: string) =>
  renderToStaticMarkup(
    <AgentRunsContext.Provider value={context}>
      <RunIndicator projectId={projectId} className="absolute" />
    </AgentRunsContext.Provider>,
  );

describe("RunIndicator", () => {
  it("pulses while a turn runs, and respects reduced motion", () => {
    const html = render(value({ snapshot: { running: [{ conversationId: "c", projectId: "p1", projectName: "P", startedAt: 1 }], attention: [] } }), "p1");
    expect(html).toContain('data-slot="run-indicator"');
    expect(html).toContain('data-state="running"');
    expect(html).toContain("animate-pulse");
    expect(html).toContain("motion-reduce:animate-none");
    expect(html).toContain('aria-label="L&#x27;agent travaille"');
    expect(html).toContain("absolute");
  });

  it("stays still for an unseen ending, and shows nothing otherwise", () => {
    const unseen = [{ conversationId: "c", projectId: "p1", projectName: "P", kind: "finished" as const, endedAt: 2 }];
    const html = render(value({ unseen }), "p1");
    expect(html).toContain('data-state="attention"');
    expect(html).not.toContain("animate-pulse");
    expect(render(value({ unseen }), "p2")).toBe("");
    expect(render(value({}))).toBe("");
    // Without projectId (sidebar): any project counts.
    expect(render(value({ unseen }))).toContain('data-state="attention"');
  });
});
