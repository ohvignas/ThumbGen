// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import StudioEditorChrome from "@/components/studio/StudioEditorChrome";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("StudioEditorChrome", () => {
  it("reserves script, description and three title rows and announces filling", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <StudioEditorChrome
          filling
          scriptEmpty
          descriptionEmpty
          titlesEmpty
          script={<textarea id="studio-script" className="min-h-64" />}
          description={<textarea id="studio-description" className="min-h-40" />}
          titles={
            <table>
              <tbody>
                <tr><td>A</td></tr>
                <tr><td>B</td></tr>
                <tr><td>C</td></tr>
              </tbody>
            </table>
          }
        />,
      );
    });

    expect(container.querySelector("#studio-script")).toBeTruthy();
    expect(container.querySelector("#studio-description")).toBeTruthy();
    expect(container.textContent).toContain("L’agent prépare les données");
    expect(container.querySelector("[aria-live='polite']")?.textContent).toContain("L’agent prépare les données");
    expect(container.querySelectorAll("[data-studio-skeleton]")).toHaveLength(3);
    expect(container.querySelectorAll("tbody tr")).toHaveLength(3);

    await act(async () => root.unmount());
    container.remove();
  });
});
