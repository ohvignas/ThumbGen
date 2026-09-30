// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import UpdateCommandCard from "@/components/settings/UpdateCommandCard";
import { THUMBGEN_UPDATE_COMMAND } from "@/lib/update-command";

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
  document.body.innerHTML = "";
});

describe("UpdateCommandCard", () => {
  it("shows the host command and copies it without claiming to run Docker", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });

    await act(async () => {
      root.render(<UpdateCommandCard />);
    });

    expect(document.body.textContent).toContain(THUMBGEN_UPDATE_COMMAND);
    expect(document.body.textContent).toMatch(/Pas de bouton magique/);
    expect(document.body.textContent).not.toMatch(/Mettre à jour maintenant/);

    const copy = Array.from(document.body.querySelectorAll("button")).find((el) =>
      el.textContent?.includes("Copier la commande"),
    );
    expect(copy).toBeTruthy();
    await act(async () => {
      copy!.click();
    });
    expect(writeText).toHaveBeenCalledWith(THUMBGEN_UPDATE_COMMAND);
  });
});
