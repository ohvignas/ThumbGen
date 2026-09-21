// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import VideoEditor from "@/components/studio/VideoEditor";
import { useStudioLiveStore } from "@/store/studio-live-store";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("@/components/panels/ChatPanel", () => ({
  default: ({ projectId }: { projectId: string }) => <div>chat:{projectId}</div>,
}));

let container: HTMLDivElement;
let root: Root;
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  push.mockReset();
  useStudioLiveStore.getState().reset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  fetchMock.mockResolvedValue(
    new Response(
      JSON.stringify({
        videoId: "vid_3db7d7d1139d809baaa3f455a1e8162d",
        updatedAt: "2026-09-20T11:00:00.000Z",
        title: "Vibe Coding : c’est quoi ?",
        summary: "Angle existant",
        etiquette: "En cours",
        youtubeUrl: null,
        draft: {
          script: "## 1. Introduction\nHook.",
          description: "Pitch",
          titleVariants: [
            { title: "A", thumbText: "a", visualConcept: "" },
            { title: "B", thumbText: "b", visualConcept: "" },
            { title: "C", thumbText: "c", visualConcept: "" },
          ],
        },
      }),
    ),
  );
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("VideoEditor", () => {
  it("loads the fiche and keeps the Miniatures A/B section", async () => {
    await act(async () => {
      root.render(<VideoEditor videoId="vid_3db7d7d1139d809baaa3f455a1e8162d" />);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(container.textContent).toContain("Vibe Coding");
    expect(container.textContent).toContain("Angle existant");
    expect(container.textContent).toContain("Notes");
    expect(container.textContent).toContain("Script Vidéo longue");
    expect(container.textContent).toContain("Description");
    expect(container.textContent).toContain("A/B Titre");
    expect(container.textContent).toContain("Miniatures A/B");
    expect(container.textContent).not.toContain("chat:studio:");
    expect(container.textContent).not.toMatch(/Ouvrir dans Notion/i);
  });

  it("shows every editor section before the GET resolves — no blank jump", async () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));
    await act(async () => {
      root.render(<VideoEditor videoId="vid_3db7d7d1139d809baaa3f455a1e8162d" />);
    });

    expect(container.textContent).toContain("Notes");
    expect(container.textContent).toContain("Script Vidéo longue");
    expect(container.textContent).toContain("Description");
    expect(container.textContent).toContain("A/B Titre");
    expect(container.textContent).toContain("Miniatures A/B");
    expect(container.textContent).not.toContain("chat:studio:");
    expect(container.querySelector<HTMLTextAreaElement>("#studio-script")?.disabled).toBe(true);
  });

  it("applies a live draft patch without PATCHing a user save", async () => {
    await act(async () => {
      root.render(<VideoEditor videoId="vid_3db7d7d1139d809baaa3f455a1e8162d" />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      useStudioLiveStore.getState().applyPatch({
        videoId: "vid_3db7d7d1139d809baaa3f455a1e8162d",
        projectId: "studio:vid_3db7d7d1139d809baaa3f455a1e8162d",
        updatedAt: "2026-09-20T11:00:01.000Z",
        previousUpdatedAt: "2026-09-20T11:00:00.000Z",
        title: "OpenClaw est mort",
        summary: "",
        script: "## 1. Introduction\nHook live.",
        description: "👉 apprendre",
        titleVariants: [
          { title: "A", thumbText: "a", visualConcept: "x" },
          { title: "B", thumbText: "b", visualConcept: "y" },
          { title: "C", thumbText: "c", visualConcept: "z" },
        ],
        phase: "filling",
      });
    });

    expect(container.textContent).toContain("L’agent prépare les données");
    expect(container.querySelector<HTMLTextAreaElement>("#studio-script")?.value).toContain("Hook live");
    expect(container.querySelector<HTMLInputElement>('input[aria-label="Titre 1"]')?.value).toBe("A");
    const patches = fetchMock.mock.calls.filter((call) => {
      const method = (call[0] instanceof Request ? call[0].method : call[1]?.method) ?? "GET";
      return method === "PATCH";
    });
    expect(patches).toHaveLength(0);
  });

  it("asks for confirmation then DELETEs the fiche and returns to /videos", async () => {
    await act(async () => {
      root.render(<VideoEditor videoId="vid_3db7d7d1139d809baaa3f455a1e8162d" />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    const trigger = container.querySelector<HTMLButtonElement>('button[aria-label="Actions de la vidéo"]');
    expect(trigger).not.toBeNull();
    await act(async () => trigger!.click());
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () =>
      Array.from(document.body.querySelectorAll<HTMLElement>("[role='menuitem']"))
        .find((el) => el.textContent?.includes("Supprimer"))!
        .click(),
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(document.body.textContent).toContain("Supprimer cette vidéo ?");
    expect(fetchMock.mock.calls.some((call) => ((call[0] instanceof Request ? call[0].method : call[1]?.method) ?? "GET") === "DELETE")).toBe(
      false,
    );

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ success: true })));
    await act(async () =>
      Array.from(document.body.querySelectorAll<HTMLButtonElement>("[role='dialog'] button"))
        .find((el) => el.textContent === "Supprimer")!
        .click(),
    );
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(fetchMock.mock.calls.some((call) => {
      const url = String(call[0] instanceof Request ? call[0].url : call[0]);
      const method = (call[0] instanceof Request ? call[0].method : call[1]?.method) ?? "GET";
      return method === "DELETE" && url.includes("/api/studio/videos/vid_3db7d7d1139d809baaa3f455a1e8162d");
    })).toBe(true);
    expect(push).toHaveBeenCalledWith("/videos");
  });
});
