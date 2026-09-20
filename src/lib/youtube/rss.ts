import { YOUTUBE_FETCH_TIMEOUT_MS, youtubeNetworkError } from "./api";

const VIDEO_ID = /<yt:videoId>\s*([\w-]{1,15})\s*<\/yt:videoId>/g;

export function youtubeRssUrl(youtubeChannelId: string): string {
  return `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(youtubeChannelId)}`;
}

export function parseYoutubeRss(xml: string): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const match of xml.matchAll(VIDEO_ID)) {
    const videoId = match[1];
    if (!videoId || seen.has(videoId)) continue;
    seen.add(videoId);
    ids.push(videoId);
  }
  return ids;
}

export async function fetchYoutubeRss(youtubeChannelId: string): Promise<string[]> {
  let res: Response;
  try {
    res = await fetch(youtubeRssUrl(youtubeChannelId), {
      signal: AbortSignal.timeout(YOUTUBE_FETCH_TIMEOUT_MS),
      headers: { accept: "application/atom+xml, application/xml, text/xml" },
    });
  } catch {
    throw youtubeNetworkError();
  }
  if (!res.ok) return [];
  return parseYoutubeRss(await res.text());
}
