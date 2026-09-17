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

  it("shows a dash when there is nothing and never throws", () => {
    expect(formatToolJson(undefined)).toBe("—");
    const loop: Record<string, unknown> = {};
    loop.self = loop;
    expect(formatToolJson(loop)).toBe("[object Object]");
  });
});
