// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import StudioCreateOverlay from "@/components/studio/StudioCreateOverlay";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/components/panels/ChatPanel", () => ({
  default: ({ projectId, layout }: { projectId: string; layout?: string }) => (
    <div>
      chat:{projectId}:{layout}
    </div>
  ),
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("StudioCreateOverlay", () => {
  it("is a centered writing dialog, not a full-screen takeover or titre + description form", async () => {
    const onDismiss = vi.fn();
    await act(async () => {
      root.render(<StudioCreateOverlay videoId="vid_new" phase="listening" onDismiss={onDismiss} />);
    });
    const dialog = document.body.querySelector("[role='dialog']");
    expect(dialog?.getAttribute("aria-modal")).toBe("true");
    expect(dialog?.className).toMatch(/max-w-3xl/);
    expect(dialog?.className).toMatch(/70vh/);
    expect(dialog?.className).not.toMatch(/w-screen|h-dvh|max-w-none/);
    const chatHost = Array.from(dialog!.querySelectorAll("div")).find((el) =>
      el.className.includes("pt-4") && el.className.includes("px-4"),
    );
    expect(chatHost).toBeTruthy();
    expect(dialog?.textContent).toContain("Nouvelle vidéo");
    expect(dialog?.textContent).toContain("L’agent t’écoute");
    expect(dialog?.textContent).not.toContain("C’est parti");
    expect(dialog?.textContent).not.toMatch(/envoie\s*\/ecrire|\/ecrire/i);
    expect(dialog?.textContent).not.toMatch(/Je vais d’abord lire|lire tes dernières fiches/i);
    expect(dialog?.textContent).not.toMatch(/miniature|\/croquis/i);
    expect(dialog?.textContent).toContain("chat:studio:vid_new:overlay");
    expect(dialog?.textContent).not.toContain("Créer et ouvrir");
    expect(dialog?.querySelector("#studio-video-title")).toBeNull();
    expect(dialog?.querySelector("#studio-video-description")).toBeNull();
    const start = Array.from(dialog!.querySelectorAll("button")).find((el) =>
      el.textContent?.includes("C’est parti"),
    );
    expect(start).toBeUndefined();
  });
});
