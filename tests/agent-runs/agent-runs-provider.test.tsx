// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { AgentRunsSnapshot } from "@/lib/agent/v2/run-types";

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

function Probe() {
  const { unseen } = useAgentRuns();
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

  it("marks the open miniature's attentions seen, without a toast", async () => {
    pathname = "/m/p1";
    await mount();
    await vi.waitFor(() => expect(JSON.parse(localStorage.getItem(RUNS_MEMORY_KEY) ?? "{}").seen).toEqual({ c1: 1000 }));
    await vi.waitFor(() => expect(unseenCount()).toBe("0"));
    expect(toastMock).not.toHaveBeenCalled();
  });
});
