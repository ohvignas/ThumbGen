// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import LinkedThumbs from "@/components/studio/LinkedThumbs";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("LinkedThumbs", () => {
  it("renders A/B/C slots from linked canvas covers and does not mention forbidden experiments", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const onLink = vi.fn();
    const onCreate = vi.fn();

    await act(async () => {
      root.render(
        <LinkedThumbs
          projects={[
            {
              id: "proj_1",
              name: "Vibe Coding",
              coverImageUrl: "/api/generated-images/image?id=abc",
              slot: "A",
            },
          ]}
          onLinkClick={onLink}
          onCreateClick={onCreate}
        />,
      );
    });

    expect(container.textContent).toContain("Miniatures A/B");
    expect(container.textContent).toContain("Vibe Coding");
    expect(container.textContent).toMatch(/\bA\b/);
    expect(container.querySelector("[data-thumb-slot='B']")).not.toBeNull();
    expect(container.querySelector("[data-thumb-slot='C']")).not.toBeNull();
    expect(container.querySelector("a")?.getAttribute("href")).toBe("/m/proj_1");
    expect(container.querySelector("img")?.getAttribute("src")).toBe("/api/generated-images/image?id=abc");
    expect(container.querySelectorAll("[data-thumb-slot]")).toHaveLength(3);
    expect(container.textContent).toContain("Lier une miniature");
    expect(container.textContent).toContain("Créer une miniature");
    expect(container.textContent).not.toMatch(/Notion|Tester et comparer/i);

    await act(async () => root.unmount());
    container.remove();
  });
});
