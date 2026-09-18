// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import BriefButton from "@/components/brief/BriefButton";
import { emptyBrief } from "@/lib/brief/schema";
import { resetBriefStore, useBriefStore } from "@/store/brief-store";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  resetBriefStore();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  document.body.innerHTML = "";
});

describe("BriefButton", () => {
  it("shows « Fiche » without a pipeline step badge", async () => {
    useBriefStore.setState({ conversationId: "c1", brief: { ...emptyBrief(), step: 3 }, updatedAt: null });
    await act(async () => root.render(<BriefButton conversationId="c1" />));
    const button = container.querySelector("button")!;
    expect(button.textContent).toContain("Fiche");
    expect(button.textContent).not.toContain("Étape");
    expect(button.getAttribute("aria-label")).toBe("Fiche");
  });

  it("has no badge without a brief for this conversation, and nothing without a conversation", async () => {
    useBriefStore.setState({ conversationId: "c1", brief: { ...emptyBrief(), step: 3 }, updatedAt: null });
    await act(async () => root.render(<BriefButton conversationId="c2" />));
    expect(container.querySelector("button")!.textContent).toContain("Fiche");
    expect(container.textContent).not.toContain("Étape");
    await act(async () => root.render(<BriefButton conversationId={null} />));
    expect(container.innerHTML).toBe("");
  });
});
