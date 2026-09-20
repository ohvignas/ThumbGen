import { afterEach, describe, expect, it, vi } from "vitest";
import { RSS_POLL_THROTTLE_MS, shouldRunRssPoll } from "@/lib/youtube/jobs";
import { startRssPollTimer, stopRssPollTimer } from "@/lib/youtube/rss-poll-timer";

const T0 = Date.parse("2026-09-19T12:00:00.000Z");

describe("shouldRunRssPoll", () => {
  it("runs when there has never been a poll", () => {
    expect(shouldRunRssPoll(0, T0)).toBe(true);
  });

  it("waits the 15-minute interval and runs on the boundary", () => {
    expect(RSS_POLL_THROTTLE_MS).toBe(15 * 60 * 1000);
    expect(shouldRunRssPoll(T0, T0 + 14 * 60 * 1000)).toBe(false);
    expect(shouldRunRssPoll(T0, T0 + 15 * 60 * 1000)).toBe(true);
    expect(shouldRunRssPoll(T0, T0 + 16 * 60 * 1000)).toBe(true);
  });
});

describe("startRssPollTimer", () => {
  afterEach(() => {
    stopRssPollTimer();
    vi.useRealTimers();
  });

  it("starts once, kicks immediately, then again when 15 minutes elapse", () => {
    vi.useFakeTimers();
    let nowMs = T0;
    const poll = vi.fn();
    expect(
      startRssPollTimer({
        intervalMs: RSS_POLL_THROTTLE_MS,
        now: () => new Date(nowMs),
        poll,
      }),
    ).toEqual({ started: true });
    expect(startRssPollTimer({ poll })).toEqual({ started: false });
    expect(poll).toHaveBeenCalledTimes(1);

    nowMs += 14 * 60 * 1000;
    vi.advanceTimersByTime(14 * 60 * 1000);
    expect(poll).toHaveBeenCalledTimes(1);

    nowMs += 60 * 1000;
    vi.advanceTimersByTime(60 * 1000);
    expect(poll).toHaveBeenCalledTimes(2);
  });
});
