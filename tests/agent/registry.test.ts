import { describe, it, expect } from "vitest";
import { z } from "zod";

// Re-import a fresh registry per test (vite cache means module is loaded once;
// to truly reset we'd need vi.resetModules — keep it simple, accept that the
// registry persists across tests in a file and use unique names).
import { registerTool, getTool, listTools } from "@/lib/agent/tools";

describe("tool registry", () => {
  it("registers and retrieves a tool", async () => {
    const echo = {
      name: "echo_test_1",
      description: "echo",
      inputSchema: z.object({ msg: z.string() }),
      handler: async ({ msg }: { msg: string }) => ({
        content: [{ type: "text" as const, text: msg }],
      }),
    };
    registerTool(echo);
    expect(getTool("echo_test_1")?.name).toBe("echo_test_1");
    expect(listTools().some((t) => t.name === "echo_test_1")).toBe(true);
    // Verify handler executes
    const r = await echo.handler({ msg: "hi" });
    expect(r.content[0]).toEqual({ type: "text", text: "hi" });
  });

  it("throws on duplicate registration", () => {
    const dup = {
      name: "echo_test_dup",
      description: "x",
      inputSchema: z.object({}),
      handler: async () => ({ content: [] }),
    };
    registerTool(dup);
    expect(() => registerTool(dup)).toThrow(/already registered/);
  });
});
