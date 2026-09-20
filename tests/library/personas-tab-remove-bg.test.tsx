// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import PersonasTab from "@/components/library/PersonasTab";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/lib/remove-bg", () => ({
  REMOVE_BG_LABEL: "Retirer le fond",
  REMOVING_BG_LABEL: "Suppression du fond…",
  stripPhotoBackgrounds: async (photos: unknown) => photos,
  removeBackgroundFromSrc: async () => "data:image/png;base64,CUTOUT",
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
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
});
