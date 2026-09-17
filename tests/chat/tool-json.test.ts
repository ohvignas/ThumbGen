import { describe, it, expect } from "vitest";
import { formatToolJson } from "@/components/panels/chat/tool-json";

describe("formatToolJson", () => {
  it("pretty-prints small values as they are", () => {
    expect(formatToolJson({ query: "macbook", limit: 8 })).toBe('{\n  "query": "macbook",\n  "limit": 8\n}');
  });

  it("shortens long strings such as base64 images", () => {
    const out = formatToolJson({ content: [{ type: "image", data: "A".repeat(5000) }] });
    expect(out).toContain(`"${"A".repeat(40)}… (5000 caractères)"`);
    expect(out.length).toBeLessThan(200);
  });

  it("shortens long data: URLs even when they contain spaces", () => {
    const url = `data:image/svg+xml,<svg ${"x ".repeat(200)}/>`;
    expect(formatToolJson({ url })).toContain(`"${url.slice(0, 40)}… (${url.length} caractères)"`);
  });

  it("keeps readable text up to 600 characters and shortens it beyond", () => {
    const words = "une phrase lisible ".repeat(25).trim(); // 474 characters
    expect(formatToolJson({ transcript: words })).toContain(`"${words}"`);
    const long = "mot ".repeat(300).trim(); // 1199 characters
    const out = formatToolJson({ transcript: long });
    expect(out).toContain(`"${long.slice(0, 600)}… (1199 caractères)"`);
  });

  it("caps the whole output at 4000 characters with a trailing … line", () => {
    const value = Array.from({ length: 200 }, (_, i) => ({ id: i, title: `Vidéo numéro ${i} avec un titre` }));
    const out = formatToolJson(value);
    expect(out.length).toBe(4002);
    expect(out.endsWith("\n…")).toBe(true);
  });

  it("shows a dash when there is nothing and never throws", () => {
    expect(formatToolJson(undefined)).toBe("—");
    const loop: Record<string, unknown> = {};
    loop.self = loop;
    expect(formatToolJson(loop)).toBe("[object Object]");
  });
});
