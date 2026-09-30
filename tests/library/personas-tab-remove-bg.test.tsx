// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import PersonasTab from "@/components/library/PersonasTab";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const stripPhotoBackgrounds = vi.fn(async (photos: unknown) => photos);

vi.mock("@/lib/remove-bg", () => ({
  REMOVE_BG_LABEL: "Retirer le fond",
  REMOVING_BG_LABEL: "Suppression du fond…",
  stripPhotoBackgrounds: (...args: unknown[]) => stripPhotoBackgrounds(...(args as [unknown])),
  removeBackgroundFromSrc: async () => "data:image/png;base64,CUTOUT",
}));

vi.mock("@/lib/library/image-file", () => ({
  PHOTO_IMPORT: { maxSize: 1600, type: "image/jpeg" },
  fileToDataUrl: async () => "data:image/jpeg;base64,ORIG",
}));

let container: HTMLDivElement;
let root: Root;
const posts: unknown[] = [];

beforeEach(() => {
  posts.length = 0;
  stripPhotoBackgrounds.mockClear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url) === "/api/personas" && init?.method === "POST") {
        posts.push(JSON.parse(String(init.body)));
        return new Response(JSON.stringify({ error: "Ajoute au moins une photo du personnage." }), { status: 400 });
      }
      if (String(url) === "/api/personas") {
        return new Response(JSON.stringify([{ id: "p1", label: "Antoine", angles: ["front", "left", "right"] }]));
      }
      return new Response("[]", { status: 404 });
    }),
  );
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("PersonasTab", () => {
  it("offers Retirer le fond on an existing personnage and on Nouveau personnage → import", async () => {
    await act(async () => {
      root.render(<PersonasTab />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    const menu = document.body.querySelector<HTMLButtonElement>('button[aria-label="Actions pour Antoine"]');
    expect(menu).toBeTruthy();
    await act(async () => menu!.click());
    expect(Array.from(document.body.querySelectorAll("div, span, button")).some((el) => el.textContent === "Retirer le fond")).toBe(
      true,
    );

    const create = Array.from(document.body.querySelectorAll("button")).find((el) => el.textContent?.includes("Nouveau personnage"));
    expect(create).toBeTruthy();
    await act(async () => create!.click());
    const importBtn = Array.from(document.body.querySelectorAll("button")).find((el) =>
      el.textContent?.includes("Importer une photo par angle"),
    );
    expect(importBtn).toBeTruthy();
    await act(async () => importBtn!.click());
    expect(Array.from(document.body.querySelectorAll("button")).some((el) => el.textContent?.includes("Retirer le fond"))).toBe(
      true,
    );
  });

  it("POSTs the photos without stripping first, and keeps the dialog open on error", async () => {
    await act(async () => {
      root.render(<PersonasTab />);
    });
    await act(async () => {
      await Promise.resolve();
    });
    const create = Array.from(document.body.querySelectorAll("button")).find((el) => el.textContent?.includes("Nouveau personnage"));
    await act(async () => create!.click());
    const importBtn = Array.from(document.body.querySelectorAll("button")).find((el) =>
      el.textContent?.includes("Importer une photo par angle"),
    );
    await act(async () => importBtn!.click());

    const input = document.body.querySelector<HTMLInputElement>('input[type="file"]');
    const file = new File(["x"], "face.jpg", { type: "image/jpeg" });
    await act(async () => {
      Object.defineProperty(input!, "files", { configurable: true, value: [file] });
      input!.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const save = Array.from(document.body.querySelectorAll("button")).find((el) => el.textContent?.includes("Créer le personnage"));
    await act(async () => save!.click());
    await act(async () => {
      await Promise.resolve();
    });

    expect(stripPhotoBackgrounds).not.toHaveBeenCalled();
    expect(posts).toHaveLength(1);
    expect((posts[0] as { photos: { front?: string } }).photos.front).toBe("data:image/jpeg;base64,ORIG");
    expect(document.body.textContent).toContain("Ajoute au moins une photo du personnage.");
    expect(document.body.textContent).toContain("Importer un personnage");
  });
});
