import { afterEach, describe, expect, it, vi } from "vitest";
import { analyticsRange, CHANNEL_ANALYTICS_METRICS, fetchChannelPeriod, queryAnalytics } from "@/lib/youtube/analytics";
import { YouTubeApiError } from "@/lib/youtube/api";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("analyticsRange", () => {
  it("covers the last N UTC days ending today", () => {
    expect(analyticsRange(28, new Date("2026-09-18T15:30:00Z"))).toEqual({
      start: "2026-08-21",
      end: "2026-09-18",
    });
    expect(analyticsRange(365, new Date("2026-09-18T00:00:00Z"))).toEqual({
      start: "2025-09-18",
      end: "2026-09-18",
    });
  });
});

describe("queryAnalytics", () => {
  it("maps column headers onto named values and video ids", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            columnHeaders: [{ name: "video" }, { name: "views" }, { name: "averageViewDuration" }],
            rows: [["abcdefghijk", 1200, 95]],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );
    const report = await queryAnalytics("ya29.token", {
      startDate: "2026-01-01",
      endDate: "2026-01-31",
      metrics: "views,averageViewDuration",
      dimensions: "video",
    });
    expect(report.rows).toEqual([
      { videoId: "abcdefghijk", day: undefined, values: { views: 1200, averageViewDuration: 95 } },
    ]);
  });

  it("throws YouTubeApiError when Analytics refuses the query", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: { errors: [{ reason: "forbidden" }] } }), {
            status: 403,
            headers: { "content-type": "application/json" },
          }),
      ),
    );
    await expect(queryAnalytics("ya29.token", { startDate: "2026-01-01", endDate: "2026-01-31", metrics: "views" })).rejects.toBeInstanceOf(
      YouTubeApiError,
    );
  });
});

describe("fetchChannelPeriod", () => {
  it("requests channel==MINE metrics for the window", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL) => {
        const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
        expect(url.searchParams.get("ids")).toBe("channel==MINE");
        expect(url.searchParams.get("metrics")).toBe(CHANNEL_ANALYTICS_METRICS);
        return new Response(
          JSON.stringify({
            columnHeaders: [{ name: "views" }, { name: "subscribersGained" }],
            rows: [[4400, 12]],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    const period = await fetchChannelPeriod("ya29.token", 28, new Date("2026-09-18T12:00:00Z"));
    expect(period).toEqual({ start: "2026-08-21", end: "2026-09-18", values: { views: 4400, subscribersGained: 12 } });
  });
});
