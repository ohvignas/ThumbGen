// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import StudioChatHost from "@/components/studio/StudioChatHost";
import { emptyStudioDraft } from "@/lib/studio/page-template";
import { useStudioLiveStore } from "@/store/studio-live-store";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { push, replace } = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/videos",
  useSearchParams: () => new URLSearchParams("create=vid_new"),
  useRouter: () => ({ push, replace }),
}));

vi.mock("@/components/panels/ChatPanel", () => ({
  default: (props: { pendingSend?: string | null }) => (
    <div>pending:{props.pendingSend ?? "none"}</div>
  ),
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  push.mockReset();
  replace.mockReset();
  useStudioLiveStore.getState().reset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("StudioChatHost", () => {
  it("is just the writing chat and reveals the fiche on the first draft patch", async () => {
    await act(async () => root.render(<StudioChatHost />));
    expect(document.body.textContent).toContain("Nouvelle vidéo");
    expect(document.body.textContent).not.toContain("C’est parti");
    expect(document.body.textContent).not.toMatch(/envoie\s*\/ecrire/i);
    expect(document.body.textContent).toContain("pending:none");

    await act(async () => {
      useStudioLiveStore.getState().applyPatch({
        videoId: "vid_new",
        projectId: "studio:vid_new",
        updatedAt: "2026-09-20T12:00:01.000Z",
        previousUpdatedAt: "2026-09-20T12:00:00.000Z",
        title: "OpenClaw",
        summary: "",
        script: "Hook",
        description: "",
        titleVariants: emptyStudioDraft().titleVariants,
        phase: "filling",
      });
    });

    expect(push).toHaveBeenCalledWith("/videos/vid_new");
  });
});
