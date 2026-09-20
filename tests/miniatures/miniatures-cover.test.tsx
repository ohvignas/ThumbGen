// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import MiniaturesView from "@/app/miniatures/MiniaturesView";
import { HQ_DOWNLOAD_LABEL, LQ_DOWNLOAD_LABEL } from "@/lib/canvas/download-thumbnail";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/components/agent-runs/RunIndicator", () => ({
  RunIndicator: () => null,
}));

const COVER = "/api/generated-images/image?id=aaaa1111-bbbb-cccc-dddd-eeeeeeeeeeee";

const WITH_COVER = {
  id: "proj_with_cover",
  name: "Avec couverture",
  description: "",
  createdAt: "2026-09-18T15:00:00.000Z",
  updatedAt: "2026-09-18T15:00:00.000Z",
  imageCount: 2,
  coverImageUrl: COVER,
};

const WITHOUT_COVER = {
  id: "proj_no_cover",
  name: "Sans couverture",
  description: "",
  createdAt: "2026-09-18T14:00:00.000Z",
  updatedAt: "2026-09-18T14:00:00.000Z",
  imageCount: 0,
  coverImageUrl: null,
};

let container: HTMLDivElement;
let root: Root;

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url === "/api/miniatures") {
        return { ok: true, json: async () => [WITH_COVER, WITHOUT_COVER] };
      }
      return { ok: false, json: async () => ({ error: "unexpected" }) };
    }),
  );
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<MiniaturesView />));
  await flush();
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("MiniaturesView cover", () => {
  it("shows the winning thumbnail on a card that has one, and the default icon otherwise", () => {
    const cover = container.querySelector<HTMLImageElement>(`img[src="${COVER}"]`);
    expect(cover).not.toBeNull();
    expect(cover?.alt).toBe("Avec couverture");
    expect(container.querySelector('[data-image-id="#EEEEEE"]')?.textContent).toBe("#EEEEEE");

    const untitled = Array.from(container.querySelectorAll("img")).filter((img) => img.alt === "Sans couverture");
    expect(untitled).toHaveLength(0);
    expect(container.textContent).toContain("Sans couverture");
    expect(container.textContent).toContain("Avec couverture");
  });

  it("offers LQ and 4K downloads for a winning cover, and disables them without one", async () => {
    const withCover = container.querySelector<HTMLButtonElement>('button[aria-label="Actions pour Avec couverture"]');
    expect(withCover).not.toBeNull();
    await act(async () => withCover!.click());
    await flush();

    const enabled = Array.from(document.body.querySelectorAll<HTMLElement>("[role='menuitem']"));
    const lq = enabled.find((el) => el.textContent?.includes(LQ_DOWNLOAD_LABEL));
    const hq = enabled.find((el) => el.textContent?.includes(HQ_DOWNLOAD_LABEL));
    expect(lq).toBeDefined();
    expect(hq).toBeDefined();
    expect(lq?.getAttribute("data-disabled")).not.toBe("true");
    expect(hq?.getAttribute("data-disabled")).not.toBe("true");

    await act(async () => {
      document.body.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    });
    await flush();

    const withoutCover = container.querySelector<HTMLButtonElement>('button[aria-label="Actions pour Sans couverture"]');
    expect(withoutCover).not.toBeNull();
    await act(async () => withoutCover!.click());
    await flush();

    const disabled = Array.from(document.body.querySelectorAll<HTMLElement>("[role='menuitem']"));
    const lqOff = disabled.find((el) => el.textContent?.includes(LQ_DOWNLOAD_LABEL));
    const hqOff = disabled.find((el) => el.textContent?.includes(HQ_DOWNLOAD_LABEL));
    expect(lqOff?.getAttribute("aria-disabled") === "true" || lqOff?.getAttribute("data-disabled") === "true").toBe(true);
    expect(hqOff?.getAttribute("aria-disabled") === "true" || hqOff?.getAttribute("data-disabled") === "true").toBe(true);
  });
});
