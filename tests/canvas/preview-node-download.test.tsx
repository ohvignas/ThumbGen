// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { NodeProps } from "@xyflow/react";
import PreviewNode from "@/components/nodes/PreviewNode";
import { HQ_DOWNLOAD_LABEL, LQ_DOWNLOAD_LABEL } from "@/lib/canvas/download-thumbnail";
import type { AppNode } from "@/store/canvas-store";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@xyflow/react", () => ({
  Handle: () => null,
  Position: { Left: "left", Right: "right", Top: "top", Bottom: "bottom" },
}));

const IMAGE = "/api/generated-images/image?id=preview-img-1";

function previewProps(data: AppNode["data"]): NodeProps<AppNode> {
  return { id: "preview-1", data } as NodeProps<AppNode>;
}

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
  document.body.innerHTML = "";
});

describe("PreviewNode thumbnail download", () => {
  it("offers LQ and 4K downloads on the preview and in the overflow menu", async () => {
    await act(async () => {
      root.render(
        <PreviewNode
          {...previewProps({
            label: "Aperçu",
            generatedImages: [IMAGE],
            selectedImageIndex: 0,
            genStatus: "done",
          })}
        />,
      );
    });

    expect(container.querySelector('[data-thumbnail-download="lq"]')?.textContent).toBe(LQ_DOWNLOAD_LABEL);
    expect(container.querySelector('[data-thumbnail-download="hq"]')?.textContent).toBe(HQ_DOWNLOAD_LABEL);
    expect(container.querySelector('[data-image-id="#EWIMG1"]')?.textContent).toBe("#EWIMG1");

    const trigger = container.querySelector<HTMLButtonElement>('button[aria-label="Actions du nœud"]');
    expect(trigger).not.toBeNull();
    await act(async () => trigger!.click());

    const labels = Array.from(container.querySelectorAll("button")).map((el) => el.textContent);
    expect(labels).toContain(LQ_DOWNLOAD_LABEL);
    expect(labels).toContain(HQ_DOWNLOAD_LABEL);
  });

  it("shows Aucune image only when there is truly no image", async () => {
    await act(async () => {
      root.render(<PreviewNode {...previewProps({ label: "Aperçu" })} />);
    });
    expect(container.textContent).toContain("Aucune image");

    await act(async () => {
      root.render(
        <PreviewNode {...previewProps({ label: "Variante A", genPromptUsed: "Turn the laptop", genModel: "GPT" })} />,
      );
    });
    expect(container.textContent).toContain("Génération interrompue");
    expect(container.textContent).not.toContain("Aucune image");

    await act(async () => {
      root.render(
        <PreviewNode
          {...previewProps({
            label: "Aperçu",
            generatedImages: ["stored:gi_73e71e83-0ee3-4b89-bebc-dda314c35e48"],
            selectedImageIndex: 0,
            genStatus: "done",
          })}
        />,
      );
    });
    expect(container.textContent).not.toContain("Aucune image");
    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "/api/generated-images/image?id=73e71e83-0ee3-4b89-bebc-dda314c35e48",
    );
  });

  it("hides the buttons and disables menu items when there is no image", async () => {
    await act(async () => {
      root.render(<PreviewNode {...previewProps({ label: "Aperçu" })} />);
    });

    expect(container.querySelector("[data-thumbnail-download]")).toBeNull();

    const trigger = container.querySelector<HTMLButtonElement>('button[aria-label="Actions du nœud"]');
    await act(async () => trigger!.click());

    const lq = Array.from(container.querySelectorAll("button")).find((el) => el.textContent === LQ_DOWNLOAD_LABEL);
    const hq = Array.from(container.querySelectorAll("button")).find((el) => el.textContent === HQ_DOWNLOAD_LABEL);
    expect(lq?.disabled).toBe(true);
    expect(hq?.disabled).toBe(true);
  });
});
