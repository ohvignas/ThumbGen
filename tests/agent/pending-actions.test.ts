import { describe, it, expect, beforeEach } from "vitest";
import {
  registerPending,
  resolvePending,
  _clearPending,
} from "@/lib/agent/pending-actions";

beforeEach(() => _clearPending());

describe("pending actions", () => {
  it("resolves a pending promise", async () => {
    const p = registerPending<{ ok: boolean }>("tool-1");
    expect(resolvePending("tool-1", { ok: true })).toBe(true);
    const r = await p;
    expect(r).toEqual({ ok: true });
  });

  it("returns false for an unknown id", () => {
    expect(resolvePending("not-registered", { ok: true })).toBe(false);
  });

  it("returns false on second resolve (registry is one-shot)", async () => {
    const p = registerPending("once");
    expect(resolvePending("once", "first")).toBe(true);
    expect(resolvePending("once", "second")).toBe(false);
    await expect(p).resolves.toBe("first");
  });

  it("supports multiple concurrent pending actions", async () => {
    const a = registerPending<string>("a");
    const b = registerPending<string>("b");
    resolvePending("b", "B");
    resolvePending("a", "A");
    expect(await a).toBe("A");
    expect(await b).toBe("B");
  });
});
