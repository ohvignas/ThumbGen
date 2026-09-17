// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import BriefPanel from "@/components/brief/BriefPanel";
import { compositionSchema, emptyBrief, type ThumbnailBrief } from "@/lib/brief/schema";
import { card, pkg } from "./fixtures";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

const brief = (): ThumbnailBrief => ({
  ...emptyBrief(),
  step: 6,
  video: { promise: "Savoir cliquer" },
  variants: [{ key: "A", ...pkg(), composition: compositionSchema.parse(card()) }],
});

async function typeAndEnter(id: string, value: string) {
  const input = container.querySelector<HTMLInputElement>(`#${id}`)!;
  expect(input).not.toBeNull();
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => {
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  });
}

describe("BriefPanel — editing", () => {
  it("saves the promise", async () => {
    const onPatch = vi.fn(async () => ({ ok: true as const, warnings: [] }));
    await act(async () => root.render(<BriefPanel brief={brief()} onPatch={onPatch} />));
    await typeAndEnter("brief-video-promise", "Savoir créer une miniature");
    expect(onPatch).toHaveBeenCalledWith({ video: { promise: "Savoir créer une miniature" } });
    expect(container.querySelector(".text-destructive")).toBeNull();
  });

  it("shows the refusal under the field", async () => {
    const onPatch = vi.fn(async () => ({
      ok: false as const,
      error: "Fiche invalide",
      issues: [{ path: "variants.A.thumbnailText", message: "Texte de miniature : 4 mots maximum" }],
    }));
    await act(async () => root.render(<BriefPanel brief={brief()} onPatch={onPatch} />));
    await typeAndEnter("brief-A-thumbnailText", "a b c d e");
    expect(onPatch).toHaveBeenCalledWith({ variant: { key: "A", set: { thumbnailText: "a b c d e" } } });
    const field = container.querySelector("#brief-A-thumbnailText")!.closest("div")!;
    expect(field.textContent).toContain("Texte de miniature : 4 mots maximum");
    expect(container.querySelector("#brief-A-thumbnailText")!.getAttribute("aria-invalid")).toBe("true");
  });

  it("edits one field of the card and sends the whole card", async () => {
    const onPatch = vi.fn(async () => ({ ok: true as const, warnings: [] }));
    await act(async () => root.render(<BriefPanel brief={brief()} onPatch={onPatch} />));
    await typeAndEnter("brief-A-focal", "Le chronomètre");
    const composition = compositionSchema.parse(card());
    expect(onPatch).toHaveBeenCalledWith({ variant: { key: "A", set: { composition: { ...composition, focal: "Le chronomètre" } } } });
  });

  it("refuses a size that is not a number without calling the server", async () => {
    const onPatch = vi.fn(async () => ({ ok: true as const, warnings: [] }));
    await act(async () => root.render(<BriefPanel brief={brief()} onPatch={onPatch} />));
    await typeAndEnter("brief-A-element-0-size", "grand");
    expect(onPatch).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Nombre entier attendu");
  });

  it("saves on Enter even while the field is composing (macOS inline predictions)", async () => {
    const onPatch = vi.fn(async () => ({ ok: true as const, warnings: [] }));
    await act(async () => root.render(<BriefPanel brief={brief()} onPatch={onPatch} />));
    const input = container.querySelector<HTMLInputElement>("#brief-video-audience")!;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    await act(async () => {
      setter.call(input, "Débutants");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", isComposing: true, bubbles: true, cancelable: true }));
    });
    expect(onPatch).toHaveBeenCalledWith({ video: { audience: "Débutants" } });
  });

  it("does not save an unchanged field", async () => {
    const onPatch = vi.fn(async () => ({ ok: true as const, warnings: [] }));
    await act(async () => root.render(<BriefPanel brief={brief()} onPatch={onPatch} />));
    await typeAndEnter("brief-video-promise", "Savoir cliquer");
    expect(onPatch).not.toHaveBeenCalled();
  });
});
