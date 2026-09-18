import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { UIMessage } from "ai";
import TurnProgress from "@/components/panels/chat/TurnProgress";
import { splitAssistantTurn } from "@/components/panels/chat/turn-model";

describe("TurnProgress", () => {
  it("does not prefix the live line with a journey step", () => {
    const html = renderToStaticMarkup(<TurnProgress message={undefined} status="submitted" startedAt={null} steps={[]} />);
    expect(html).toContain('<span role="status" aria-live="polite" class="sr-only">Réfléchit</span>');
    expect(html).not.toContain("Étape");
  });

  it("shows one status line with the current step, a timer and a folded live detail", () => {
    const message = {
      id: "a1",
      role: "assistant",
      parts: [
        { type: "step-start" },
        { type: "text", text: "Je cherche des miniatures." },
        { type: "tool-search_youtube", toolCallId: "c1", state: "input-available", input: { query: "macbook" } },
      ],
    } as unknown as UIMessage;
    const html = renderToStaticMarkup(
      <TurnProgress message={message} status="streaming" startedAt={null} steps={splitAssistantTurn(message).steps} />,
    );
    expect(html.match(/role="status"/g)).toHaveLength(2); // the live region and the (aria-hidden) Spinner
    expect(html).toContain("Cherche sur YouTube");
    expect(html).toContain("0:00");
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain("Je cherche des miniatures.");
  });

  it("announces the step label in one polite live region outside the trigger button, without the timer (M4)", () => {
    const html = renderToStaticMarkup(<TurnProgress message={undefined} status="submitted" startedAt={null} steps={[]} />);
    expect(html).toContain('<span role="status" aria-live="polite" class="sr-only">Réfléchit</span>');
    const button = html.slice(html.indexOf("<button"), html.indexOf("</button>"));
    expect(button).not.toContain('role="status" aria-live');
    expect(button).not.toMatch(/data-slot="marker"[^>]*role="status"/);
    expect(button).toContain("Réfléchit");
    expect(html.indexOf('aria-live="polite"')).toBeLessThan(html.indexOf("<button"));
  });

  it("stops the spinner and chevron motion when reduced motion is requested (M5)", () => {
    const html = renderToStaticMarkup(<TurnProgress message={undefined} status="submitted" startedAt={null} steps={[]} />);
    const spinner = html.match(/<svg[^>]*data-slot="spinner"[^>]*>/)?.[0] ?? "";
    expect(spinner).toContain("animate-spin motion-reduce:animate-none");
    expect(html).toContain("group-data-[panel-open]/progress:rotate-90 motion-reduce:transition-none");
  });

  it("says Réfléchit while the request is only submitted", () => {
    const html = renderToStaticMarkup(<TurnProgress message={undefined} status="submitted" startedAt={null} steps={[]} />);
    expect(html).toContain("Réfléchit");
  });
});
