// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { AgentRunsSnapshot, AttentionEntry } from "@/lib/agent/v2/run-types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let pathname = "/bibliotheque";
const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push: pushMock }),
}));

const toastMock = vi.fn((..._args: unknown[]) => "id");
vi.mock("@/components/ui/toast", () => ({ toast: (...args: unknown[]) => toastMock(...args) }));

import { AgentRunsProvider, useAgentRuns } from "@/components/agent-runs/AgentRunsProvider";
import { RUNS_MEMORY_KEY } from "@/components/agent-runs/agent-runs-model";

const SNAPSHOT: AgentRunsSnapshot = {
  running: [],
  attention: [{ conversationId: "c1", projectId: "p1", projectName: "Vidéo F1", kind: "finished", endedAt: 1000 }],
};

const probe: {
  refresh: null | (() => Promise<AgentRunsSnapshot>);
  unseenOnArrival: null | (() => AttentionEntry[]);
} = { refresh: null, unseenOnArrival: null };

function Probe() {
  const { unseen, refreshRuns, unseenOnArrival } = useAgentRuns();
  useEffect(() => {
    probe.refresh = refreshRuns;
    probe.unseenOnArrival = unseenOnArrival;
  }, [refreshRuns, unseenOnArrival]);
  return <span data-testid="unseen">{unseen.length}</span>;
}

let root: Root | null = null;
async function mount() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () =>
    root!.render(
      <AgentRunsProvider>
        <Probe />
      </AgentRunsProvider>,
    ),
  );
}
async function unmount() {
  await act(async () => root?.unmount());
  root = null;
}
const unseenCount = () => document.querySelector('[data-testid="unseen"]')?.textContent;

beforeEach(() => {
  localStorage.clear();
  toastMock.mockClear();
  pushMock.mockClear();
  vi.stubGlobal("fetch", vi.fn(async () => Response.json(SNAPSHOT)));
});
afterEach(async () => {
  await unmount();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("AgentRunsProvider", () => {
  it("toasts an unseen attention of another page once, with « Ouvrir »", async () => {
    pathname = "/bibliotheque";
    await mount();
    await vi.waitFor(() => expect(toastMock).toHaveBeenCalledTimes(1));
    const options = toastMock.mock.calls[0][0] as { id: string; title: string; action: { label: string; onClick: () => void } };
    expect(options.title).toBe("L'agent a fini — Vidéo F1");
    expect(options.action.label).toBe("Ouvrir");
    options.action.onClick();
    expect(pushMock).toHaveBeenCalledWith("/m/p1");
    await vi.waitFor(() => expect(unseenCount()).toBe("1"));
    expect(JSON.parse(localStorage.getItem(RUNS_MEMORY_KEY)!).toasted).toEqual({ c1: 1000 });

    await unmount();
    await mount();
    await vi.waitFor(() => expect(vi.mocked(fetch).mock.calls.length).toBeGreaterThanOrEqual(2));
    expect(toastMock).toHaveBeenCalledTimes(1);
  });

  it("marks the open miniature's attentions seen, without a toast, but remembers they were unseen on arrival", async () => {
    pathname = "/m/p1";
    await mount();
    await vi.waitFor(() => expect(JSON.parse(localStorage.getItem(RUNS_MEMORY_KEY) ?? "{}").seen).toEqual({ c1: 1000 }));
    await vi.waitFor(() => expect(unseenCount()).toBe("0"));
    expect(toastMock).not.toHaveBeenCalled();
    // useConversations picks among what was unseen when the page opened.
    expect(probe.unseenOnArrival!().map((entry) => entry.conversationId)).toEqual(["c1"]);
  });

  it("does not report an attention already seen before arriving", async () => {
    localStorage.setItem(RUNS_MEMORY_KEY, JSON.stringify({ seen: { c1: 1000 }, toasted: {} }));
    pathname = "/m/p1";
    await mount();
    await vi.waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());
    await act(async () => {
      await probe.refresh!();
    });
    expect(probe.unseenOnArrival!()).toEqual([]);
  });

  it("re-reads what another tab already toasted or saw before toasting, and keeps both tabs' entries", async () => {
    pathname = "/bibliotheque";
    await mount();
    await vi.waitFor(() => expect(toastMock).toHaveBeenCalledTimes(1));

    // Another tab toasted c2 meanwhile.
    const stored = JSON.parse(localStorage.getItem(RUNS_MEMORY_KEY)!);
    localStorage.setItem(RUNS_MEMORY_KEY, JSON.stringify({ ...stored, toasted: { ...stored.toasted, c2: 2000 } }));
    const both: AgentRunsSnapshot = {
      running: [],
      attention: [...SNAPSHOT.attention, { conversationId: "c2", projectId: "p2", projectName: "Autre", kind: "error", endedAt: 2000 }],
    };
    vi.mocked(fetch).mockImplementation(async () => Response.json(both));
    await act(async () => {
      await probe.refresh!();
    });
    expect(toastMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem(RUNS_MEMORY_KEY)!).toasted).toEqual({ c1: 1000, c2: 2000 });
  });

  it("ignores a response older than one already applied", async () => {
    pathname = "/m/p9";
    await mount();
    await vi.waitFor(() => expect(unseenCount()).toBe("1"));

    const resolvers: Array<(response: Response) => void> = [];
    vi.mocked(fetch).mockImplementation(() => new Promise<Response>((resolve) => resolvers.push(resolve)));
    let older!: Promise<AgentRunsSnapshot>;
    let newer!: Promise<AgentRunsSnapshot>;
    await act(async () => {
      older = probe.refresh!();
      newer = probe.refresh!();
    });
    await vi.waitFor(() => expect(resolvers).toHaveLength(2));
    await act(async () => {
      resolvers[1](Response.json({ running: [], attention: [] }));
      await newer;
      resolvers[0](Response.json(SNAPSHOT));
      await older;
    });
    expect(unseenCount()).toBe("0");
  });
});
