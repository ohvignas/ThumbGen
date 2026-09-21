// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import VideosBoard from "@/components/studio/VideosBoard";
import { useChatStore } from "@/store/chat-store";
import { useStudioCreateStore } from "@/store/studio-create-store";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const push = vi.fn();
const replace = vi.fn();
const fetchMock = vi.fn<typeof fetch>();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/videos",
}));

let container: HTMLDivElement;
let root: Root;

let listed = [
  {
    videoId: "vid_aaa",
    title: "Vibe Coding : c’est quoi ?",
    etiquette: "En cours",
    youtubeUrl: null,
    summary: "Angle existant",
    draft: { script: "", description: "", titleVariants: [] },
  },
];

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function button(label: string, rootNode: ParentNode = document.body) {
  return Array.from(rootNode.querySelectorAll("button")).find((el) => el.textContent?.includes(label));
}

async function typeInto(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")!.set!;
  await act(async () => {
    setter.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

beforeEach(() => {
  push.mockReset();
  replace.mockReset();
  useChatStore.getState().reset();
  useStudioCreateStore.getState().clearAbandon();
  fetchMock.mockReset();
  listed = [
    {
      videoId: "vid_aaa",
      title: "Vibe Coding : c’est quoi ?",
      etiquette: "En cours",
      youtubeUrl: null,
      summary: "Angle existant",
      draft: { script: "", description: "", titleVariants: [] },
    },
  ];
  fetchMock.mockImplementation(async (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    const method = (input instanceof Request ? input.method : init?.method) ?? "GET";
    if (url.includes("/api/studio/videos/vid_aaa") && method === "PATCH") {
      const body = JSON.parse(String(init?.body ?? "{}")) as { title?: string; description?: string; summary?: string };
      listed[0] = {
        ...listed[0],
        title: body.title ?? listed[0].title,
        summary: body.summary ?? body.description ?? listed[0].summary,
      };
      return new Response(JSON.stringify(listed[0]));
    }
    if (url.includes("/api/studio/videos/vid_aaa") && method === "DELETE") {
      listed = [];
      return new Response(JSON.stringify({ success: true }));
    }
    if (url.includes("/api/studio/videos") && !url.includes("import") && method === "GET") {
      return new Response(JSON.stringify(listed));
    }
    if (url.includes("/api/studio/videos") && method === "POST") {
      return new Response(JSON.stringify({ videoId: "vid_new", title: "OpenClaw" }), { status: 201 });
    }
    return new Response("[]");
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("VideosBoard", () => {
  it("renders the five Étiquettes columns, the En cours card, and Nouvelle vidéo — not a Notion sync", async () => {
    await act(async () => {
      root.render(<VideosBoard />);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(container.textContent).toContain("En cours");
    expect(container.textContent).toContain("Propositions");
    expect(container.textContent).toContain("Vibe Coding");
    expect(container.textContent).toContain("Nouvelle vidéo");
    expect(container.textContent).not.toMatch(/Synchroniser Notion/i);
    expect(container.textContent).not.toMatch(/fiches Notion/i);
  });

  it("keeps the same max-w-6xl container in Kanban and Liste", async () => {
    await act(async () => {
      root.render(<VideosBoard />);
    });
    await flush();

    const shell = () => container.querySelector(".max-w-6xl");
    expect(shell()?.className).toContain("mx-auto");
    expect(shell()?.className).toContain("w-full");
    expect(shell()?.className).toContain("max-w-6xl");
    expect(shell()?.querySelector(".min-h-112.overflow-x-auto")).toBeTruthy();

    await act(async () => button("Liste", container)!.click());
    await flush();

    expect(shell()?.className).toContain("mx-auto");
    expect(shell()?.className).toContain("w-full");
    expect(shell()?.className).toContain("max-w-6xl");
  });

  it("creates a hidden Propositions draft immediately and opens the writing overlay", async () => {
    await act(async () => {
      root.render(<VideosBoard />);
    });
    await flush();

    const create = button("Nouvelle vidéo", container);
    expect(create).toBeTruthy();
    await act(async () => create!.click());
    await flush();

    const post = fetchMock.mock.calls.find((call) => {
      const input = call[0];
      const init = call[1];
      const method = (input instanceof Request ? input.method : init?.method) ?? "GET";
      return method === "POST";
    });
    expect(post).toBeTruthy();
    const body = JSON.parse(String(post![1]?.body));
    expect(body).toMatchObject({
      title: "Sans titre",
      etiquette: "Propositions",
    });
    expect(push).not.toHaveBeenCalledWith("/videos/vid_new");
    expect(replace).toHaveBeenCalledWith("/videos?create=vid_new");
    expect(container.textContent).not.toContain("Sans titre");
    expect(document.body.querySelector("#studio-video-title")).toBeNull();
  });

  it("creates immediately from the empty-state Nouvelle vidéo CTA", async () => {
    listed = [];
    await act(async () => {
      root.render(<VideosBoard />);
    });
    await flush();

    const creates = Array.from(container.querySelectorAll("button")).filter((el) =>
      el.textContent?.includes("Nouvelle vidéo"),
    );
    expect(creates).toHaveLength(2);
    await act(async () => creates[1]!.click());
    await flush();

    const post = fetchMock.mock.calls.find((call) => {
      const method = (call[0] instanceof Request ? call[0].method : call[1]?.method) ?? "GET";
      return method === "POST";
    });
    expect(JSON.parse(String(post![1]?.body))).toMatchObject({
      title: "Sans titre",
      etiquette: "Propositions",
    });
    expect(replace).toHaveBeenCalledWith("/videos?create=vid_new");
  });

  it("silently deletes an abandoned hidden draft when no conversation exists", async () => {
    listed = [{
      videoId: "vid_hidden",
      title: "Sans titre",
      etiquette: "Propositions",
      youtubeUrl: null,
      summary: "",
      draft: { script: "", description: "", titleVariants: [] },
    }];
    await act(async () => root.render(<VideosBoard />));
    await flush();

    await act(async () => useStudioCreateStore.getState().requestAbandon("vid_hidden"));
    await flush();

    expect(fetchMock.mock.calls.some((call) => {
      const url = String(call[0] instanceof Request ? call[0].url : call[0]);
      const method = (call[0] instanceof Request ? call[0].method : call[1]?.method) ?? "GET";
      return method === "DELETE" && url.includes("/api/studio/videos/vid_hidden");
    })).toBe(true);
    expect(replace).toHaveBeenCalledWith("/videos");
  });

  it("confirms before deleting an abandoned hidden draft with a conversation", async () => {
    listed = [{
      videoId: "vid_hidden",
      title: "Sans titre",
      etiquette: "Propositions",
      youtubeUrl: null,
      summary: "",
      draft: { script: "", description: "", titleVariants: [] },
    }];
    useChatStore.getState().setActive("conversation_1");
    await act(async () => root.render(<VideosBoard />));
    await flush();

    await act(async () => useStudioCreateStore.getState().requestAbandon("vid_hidden"));
    await flush();

    expect(document.body.textContent).toContain("Abandonner ce brouillon ?");
    expect(document.body.textContent).toContain("La conversation sera perdue. La fiche vide sera supprimée.");
    expect(fetchMock.mock.calls.some((call) =>
      ((call[0] instanceof Request ? call[0].method : call[1]?.method) ?? "GET") === "DELETE",
    )).toBe(false);

    await act(async () => button("Abandonner", document.body)!.click());
    await flush();
    expect(replace).toHaveBeenCalledWith("/videos");
  });

  it("keeps an abandoned draft that has become visible", async () => {
    await act(async () => root.render(<VideosBoard />));
    await flush();

    await act(async () => useStudioCreateStore.getState().requestAbandon("vid_aaa"));
    await flush();

    expect(fetchMock.mock.calls.some((call) =>
      ((call[0] instanceof Request ? call[0].method : call[1]?.method) ?? "GET") === "DELETE",
    )).toBe(false);
    expect(replace).toHaveBeenCalledWith("/videos");
  });

  it("offers Ouvrir, Modifier and Supprimer on the card, then edits or deletes after confirm", async () => {
    await act(async () => {
      root.render(<VideosBoard />);
    });
    await flush();

    const trigger = container.querySelector<HTMLButtonElement>('button[aria-label="Actions pour Vibe Coding : c’est quoi ?"]');
    expect(trigger).not.toBeNull();
    await act(async () => trigger!.click());
    await flush();

    const items = Array.from(document.body.querySelectorAll<HTMLElement>("[role='menuitem']")).map((el) => el.textContent);
    expect(items.some((text) => text?.includes("Ouvrir"))).toBe(true);
    expect(items.some((text) => text?.includes("Modifier"))).toBe(true);
    expect(items.some((text) => text?.includes("Supprimer"))).toBe(true);

    const edit = Array.from(document.body.querySelectorAll<HTMLElement>("[role='menuitem']")).find((el) =>
      el.textContent?.includes("Modifier"),
    );
    await act(async () => edit!.click());
    await flush();

    const dialog = document.body.querySelector("[role='dialog']");
    expect(dialog?.textContent).toContain("Modifier la vidéo");
    const title = dialog!.querySelector<HTMLInputElement>("#studio-video-title");
    const description = dialog!.querySelector<HTMLTextAreaElement>("#studio-video-description");
    expect(title?.value).toBe("Vibe Coding : c’est quoi ?");
    expect(description?.value).toBe("Angle existant");
    await typeInto(title!, "Vibe Coding v2");
    await typeInto(description!, "Nouvel angle");
    await act(async () => button("Enregistrer", dialog!)!.click());
    await flush();

    const patch = fetchMock.mock.calls.find((call) => {
      const input = call[0];
      const init = call[1];
      const method = (input instanceof Request ? input.method : init?.method) ?? "GET";
      return method === "PATCH";
    });
    expect(JSON.parse(String(patch![1]?.body))).toMatchObject({
      title: "Vibe Coding v2",
      description: "Nouvel angle",
    });
    expect(push).not.toHaveBeenCalled();

    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="Actions pour Vibe Coding v2"]')!.click());
    await flush();
    await act(async () =>
      Array.from(document.body.querySelectorAll<HTMLElement>("[role='menuitem']"))
        .find((el) => el.textContent?.includes("Supprimer"))!
        .click(),
    );
    await flush();
    expect(document.body.textContent).toContain("Supprimer cette vidéo ?");
    expect(fetchMock.mock.calls.some((call) => ((call[0] instanceof Request ? call[0].method : call[1]?.method) ?? "GET") === "DELETE")).toBe(
      false,
    );

    await act(async () =>
      Array.from(document.body.querySelectorAll<HTMLButtonElement>("[role='dialog'] button"))
        .find((el) => el.textContent === "Supprimer")!
        .click(),
    );
    await flush();
    await flush();

    expect(fetchMock.mock.calls.some((call) => {
      const url = String(call[0] instanceof Request ? call[0].url : call[0]);
      const method = (call[0] instanceof Request ? call[0].method : call[1]?.method) ?? "GET";
      return method === "DELETE" && url.includes("/api/studio/videos/vid_aaa");
    })).toBe(true);
    expect(container.textContent).toContain("Aucune vidéo pour l'instant");
  });

  it("keeps the card and shows the error when DELETE fails", async () => {
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input instanceof Request ? input.url : input);
      const method = (input instanceof Request ? input.method : init?.method) ?? "GET";
      if (url.includes("/api/studio/videos/vid_aaa") && method === "DELETE") {
        return new Response(JSON.stringify({ error: "Failed to delete" }), { status: 500 });
      }
      if (url.includes("/api/studio/videos") && method === "GET") {
        return new Response(JSON.stringify(listed));
      }
      return new Response("[]");
    });
    await act(async () => {
      root.render(<VideosBoard />);
    });
    await flush();
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="Actions pour Vibe Coding : c’est quoi ?"]')!.click());
    await flush();
    await act(async () =>
      Array.from(document.body.querySelectorAll<HTMLElement>("[role='menuitem']"))
        .find((el) => el.textContent?.includes("Supprimer"))!
        .click(),
    );
    await flush();
    await act(async () =>
      Array.from(document.body.querySelectorAll<HTMLButtonElement>("[role='dialog'] button"))
        .find((el) => el.textContent === "Supprimer")!
        .click(),
    );
    await flush();

    expect(document.body.querySelector("[role='dialog'] [role='alert']")?.textContent).toBe(
      "La suppression a échoué. Réessaie.",
    );
    expect(container.textContent).toContain("Vibe Coding");
  });
});
