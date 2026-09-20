// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import PersonaImportDialog from "@/components/panels/PersonaImportDialog";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const stripPhotoBackgrounds = vi.fn(async (photos: Record<string, string>) => ({
  ...photos,
  front: "data:image/png;base64,CUTOUT",
}));

vi.mock("@/lib/remove-bg", () => ({
  REMOVE_BG_LABEL: "Retirer le fond",
  REMOVING_BG_LABEL: "Suppression du fond…",
  stripPhotoBackgrounds: (...args: unknown[]) => stripPhotoBackgrounds(...(args as [Record<string, string>])),
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  stripPhotoBackgrounds.mockClear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  document.body.innerHTML = "";
});

const buttons = () => Array.from(document.body.querySelectorAll<HTMLButtonElement>("button"));
const button = (text: string) => buttons().find((el) => el.textContent?.includes(text));

describe("PersonaImportDialog", () => {
  it("shows Retirer le fond disabled until a photo is added, then strips it", async () => {
    const prepareFile = vi.fn(async () => "data:image/jpeg;base64,ORIG");
    await act(async () => {
      root.render(
        <PersonaImportDialog onClose={() => {}} prepareFile={prepareFile} onSubmit={async () => {}} saving={false} />,
      );
    });

    const strip = button("Retirer le fond");
    expect(strip).toBeDefined();
    expect(strip!.disabled).toBe(true);

    const input = document.body.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).toBeTruthy();
    const file = new File(["x"], "face.jpg", { type: "image/jpeg" });
    await act(async () => {
      Object.defineProperty(input!, "files", { configurable: true, value: [file] });
      input!.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(prepareFile).toHaveBeenCalledOnce();
    expect(button("Retirer le fond")!.disabled).toBe(false);

    await act(async () => button("Retirer le fond")!.click());
    expect(stripPhotoBackgrounds).toHaveBeenCalledOnce();
    const img = document.body.querySelector<HTMLImageElement>('img[alt="Face"]');
    expect(img?.src).toContain("CUTOUT");
  });
});
