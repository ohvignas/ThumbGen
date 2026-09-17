import { beforeEach, describe, expect, it } from "vitest";
import {
  acquireChannelLock,
  channelRuntime,
  isChannelLocked,
  isQuotaBlocked,
  markQuotaBlocked,
  nextQuotaReset,
  releaseChannelLock,
  resetChannelRuntime,
} from "@/lib/youtube/runtime";

beforeEach(() => {
  resetChannelRuntime();
});

describe("channel locks", () => {
  it("lets one sync hold a channel at a time", () => {
    expect(acquireChannelLock("c1")).toBe(true);
    expect(acquireChannelLock("c1")).toBe(false);
    expect(acquireChannelLock("c2")).toBe(true);
    expect(isChannelLocked("c1")).toBe(true);
    releaseChannelLock("c1");
    expect(isChannelLocked("c1")).toBe(false);
    expect(acquireChannelLock("c1")).toBe(true);
  });

  it("keeps its state on globalThis so every route bundle shares it", () => {
    acquireChannelLock("shared");
    expect(globalThis.__thumbgen_channel_runtime?.locks.has("shared")).toBe(true);
    expect(channelRuntime()).toBe(globalThis.__thumbgen_channel_runtime);
  });
});

describe("quota block", () => {
  it("lasts until the next 08:00 UTC", () => {
    expect(nextQuotaReset(new Date("2026-09-16T05:00:00.000Z")).toISOString()).toBe("2026-09-16T08:00:00.000Z");
    expect(nextQuotaReset(new Date("2026-09-16T08:00:00.000Z")).toISOString()).toBe("2026-09-17T08:00:00.000Z");
    expect(nextQuotaReset(new Date("2026-09-16T23:30:00.000Z")).toISOString()).toBe("2026-09-17T08:00:00.000Z");
  });

  it("blocks automatic syncs until then", () => {
    const now = new Date("2026-09-16T12:00:00.000Z");
    expect(isQuotaBlocked(now)).toBe(false);
    markQuotaBlocked(now);
    expect(isQuotaBlocked(new Date("2026-09-17T07:59:00.000Z"))).toBe(true);
    expect(isQuotaBlocked(new Date("2026-09-17T08:00:00.000Z"))).toBe(false);
  });
});
