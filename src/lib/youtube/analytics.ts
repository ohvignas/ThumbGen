import { YouTubeApiError, YOUTUBE_FETCH_TIMEOUT_MS, youtubeNetworkError } from "./api";

const ANALYTICS_URL = "https://youtubeanalytics.googleapis.com/v2/reports";

export const CHANNEL_ANALYTICS_METRICS =
  "views,engagedViews,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,subscribersGained,subscribersLost";

export const VIDEO_ANALYTICS_METRICS =
  "views,engagedViews,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,likes,comments,shares,subscribersGained";

export type AnalyticsRow = {
  videoId?: string;
  day?: string;
  values: Record<string, number | null>;
};

export type AnalyticsReport = { columnHeaders: string[]; rows: AnalyticsRow[] };

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function analyticsRange(days: number, now = new Date()): { start: string; end: string } {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - days);
  return { start: isoDate(start), end: isoDate(end) };
}

export async function queryAnalytics(
  accessToken: string,
  params: Record<string, string>,
): Promise<AnalyticsReport> {
  const search = new URLSearchParams({ ids: "channel==MINE", ...params });
  let res: Response;
  try {
    res = await fetch(`${ANALYTICS_URL}?${search.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(YOUTUBE_FETCH_TIMEOUT_MS),
    });
  } catch {
    throw youtubeNetworkError();
  }
  if (!res.ok) {
    let reason: string | null = null;
    try {
      const body = (await res.json()) as { error?: { errors?: Array<{ reason?: unknown }> } };
      const raw = body.error?.errors?.[0]?.reason;
      reason = typeof raw === "string" ? raw : null;
    } catch {
      reason = null;
    }
    throw new YouTubeApiError(res.status, reason, `YouTube Analytics a refusé la requête (${res.status}${reason ? ` · ${reason}` : ""})`);
  }
  const body = (await res.json()) as {
    columnHeaders?: Array<{ name?: string }>;
    rows?: Array<Array<string | number>>;
  };
  const columnHeaders = (body.columnHeaders ?? []).map((col) => col.name ?? "");
  const rows: AnalyticsRow[] = (body.rows ?? []).map((cells) => {
    const values: Record<string, number | null> = {};
    let videoId: string | undefined;
    let day: string | undefined;
    for (let i = 0; i < columnHeaders.length; i++) {
      const name = columnHeaders[i]!;
      const cell = cells[i];
      if (name === "video") videoId = String(cell ?? "");
      else if (name === "day") day = String(cell ?? "");
      else values[name] = cell === undefined || cell === null || cell === "" ? null : Number(cell);
    }
    return { videoId, day, values };
  });
  return { columnHeaders, rows };
}

export async function fetchChannelPeriod(
  accessToken: string,
  days: number,
  now = new Date(),
): Promise<{ start: string; end: string; values: Record<string, number | null> }> {
  const { start, end } = analyticsRange(days, now);
  const report = await queryAnalytics(accessToken, {
    startDate: start,
    endDate: end,
    metrics: CHANNEL_ANALYTICS_METRICS,
  });
  return { start, end, values: report.rows[0]?.values ?? {} };
}

export async function fetchTopVideoAnalytics(
  accessToken: string,
  days: number,
  now = new Date(),
): Promise<{ start: string; end: string; rows: AnalyticsRow[] }> {
  const { start, end } = analyticsRange(days, now);
  const report = await queryAnalytics(accessToken, {
    startDate: start,
    endDate: end,
    metrics: VIDEO_ANALYTICS_METRICS,
    dimensions: "video",
    sort: "-views",
    maxResults: "200",
  });
  return { start, end, rows: report.rows };
}
