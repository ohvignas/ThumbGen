// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useChatStore } from "@/store/chat-store";
import { useConversations } from "@/components/panels/chat/useConversations";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Conv = { id: string; title: string; updated_at: string };
const conv = (id: string): Conv => ({ id, title: id, updated_at: "2026-09-20T10:00:00.000Z" });

const pending = new Map<string, { resolve: (list: Conv[]) => void }>();

function Probe({ projectId }: { projectId: string }) {
  const { conversations, activeConversationId } = useConversations(projectId);
  return (
    <span data-testid="state">
      {projectId}|{activeConversationId ?? "none"}|{conversations.map((c) => c.id).join(",") || "empty"}
    </span>
  );
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;
async function render(projectId: string) {
  if (!container) {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  }
  await act(async () => root!.render(<Probe projectId={projectId} />));
}
async function unmount() {
  await act(async () => root?.unmount());
  root = null;
  container = null;
}
const readout = () => document.querySelector("[data-testid='state']")?.textContent ?? "";

beforeEach(() => {
  useChatStore.getState().reset();
  pending.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const projectId = new URL(url, "http://thumbgen.local").searchParams.get("project_id");
      if (!projectId) return Response.json([]);
      const list = await new Promise<Conv[]>((resolve) => {
        pending.set(projectId, { resolve });
      });
      return Response.json(list);
    }),
  );
});
afterEach(async () => {
  await unmount();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("useConversations project isolation", () => {
  it("does not restore another miniature's conversation after switching to an empty project", async () => {
    useChatStore.getState().setActive("conv-old", "proj-a");
    await render("proj-a");
    await vi.waitFor(() => expect(pending.has("proj-a")).toBe(true));

    await render("proj-b");
    await vi.waitFor(() => expect(pending.has("proj-b")).toBe(true));
    await act(async () => pending.get("proj-b")!.resolve([]));
    await vi.waitFor(() => expect(readout()).toBe("proj-b|none|empty"));

    await act(async () => pending.get("proj-a")!.resolve([conv("conv-old")]));
    await act(async () => {});

    expect(readout()).toBe("proj-b|none|empty");
    expect(useChatStore.getState().activeConversationId).toBeNull();
  });
});
