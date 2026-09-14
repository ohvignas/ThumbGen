import { describe, it, expect } from "vitest";
import { V2_CLIENT_TOOLS, V2_CLIENT_TOOL_NAMES } from "@/lib/agent/v2/browser-client-tools";

describe("v2 browser client tools", () => {
  it("exposes request_user_image with no execute (resolved client-side)", () => {
    expect(V2_CLIENT_TOOL_NAMES.has("request_user_image")).toBe(true);
    expect(V2_CLIENT_TOOLS.request_user_image.execute).toBeUndefined();
  });

  it("reuses the exact v1 input schema (reason required, suggested_kind enum)", () => {
    const schema = V2_CLIENT_TOOLS.request_user_image.inputSchema as {
      safeParse: (v: unknown) => { success: boolean };
    };
    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ reason: "need a face" }).success).toBe(true);
    expect(schema.safeParse({ reason: "x", suggested_kind: "weird" }).success).toBe(false);
  });
});
