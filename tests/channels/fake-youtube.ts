import { vi, type Mock } from "vitest";

/**
 * In-memory YouTube for tests: www.googleapis.com/youtube/v3 (channels,
 * playlists, playlistItems, videos, search) and i.ytimg.com thumbnails. Every
 * other host answers 404, so no test can reach a real service through fetch.
 */

export function channelIdFor(letter: string): string {
  return `UC${letter.repeat(22)}`;
}

export type FakeChannel = {
  id: string;
  handle: string;
  title: string;
  subscribers?: number;
  hiddenSubscribers?: boolean;
  hasLongFormPlaylist?: boolean;
};

export type FakeVideo = {
  id: string;
  channelId: string;
  publishedAt: string;
  title?: string;
  durationSeconds?: number;
  views?: number;
  likes?: number | null;
  live?: "none" | "live" | "upcoming";
  short?: boolean;
};

export type FakeCall = { resource: string; params: URLSearchParams };

export type FakeYouTube = {
  fetch: Mock<(input: RequestInfo | URL) => Promise<Response>>;
  calls: FakeCall[];
  count: (resource: string) => number;
  setQuotaAfter: (calls: number | null) => void;
  setNetworkDown: (down: boolean) => void;
  addVideo: (video: FakeVideo) => void;
  removeVideo: (videoId: string) => void;
  setViews: (videoId: string, views: number) => void;
};

export function isoDuration(totalSeconds: number): string {
  if (totalSeconds === 0) return "P0D";
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `PT${hours ? `${hours}H` : ""}${minutes ? `${minutes}M` : ""}${seconds ? `${seconds}S` : ""}`;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function apiError(status: number, reason: string, domain = "youtube.api"): Response {
  return json(status, { error: { code: status, message: `Fake ${reason}`, errors: [{ message: `Fake ${reason}`, domain, reason }] } });
}

export function createFakeYouTube(
  setup: {
    channels?: FakeChannel[];
    videos?: FakeVideo[];
    playlists?: Record<string, string>;
    thumbnails?: Record<string, string[]>;
  } = {},
): FakeYouTube {
  const channels = new Map((setup.channels ?? []).map((channel) => [channel.id, channel]));
  let videos = [...(setup.videos ?? [])];
  const calls: FakeCall[] = [];
  let quotaLeft: number | null = null;
  let networkDown = false;

  const playlistVideos = (playlistId: string): FakeVideo[] | null => {
    const longForm = playlistId.startsWith("UULF");
    if (!longForm && !playlistId.startsWith("UU")) return null;
    const channel = channels.get(`UC${playlistId.slice(longForm ? 4 : 2)}`);
    if (!channel || (longForm && channel.hasLongFormPlaylist === false)) return null;
    return videos
      .filter((video) => video.channelId === channel.id)
      .filter((video) => !longForm || (!video.short && (video.live ?? "none") === "none"))
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  };

  const channelItem = (channel: FakeChannel) => ({
    id: channel.id,
    snippet: {
      title: channel.title,
      customUrl: channel.handle.toLowerCase(),
      thumbnails: {
        default: { url: `https://yt3.example/${channel.id}-small.jpg` },
        medium: { url: `https://yt3.example/${channel.id}.jpg` },
      },
    },
    statistics: {
      subscriberCount: String(channel.subscribers ?? 1000),
      hiddenSubscriberCount: channel.hiddenSubscribers ?? false,
      videoCount: String(videos.filter((video) => video.channelId === channel.id).length),
    },
    contentDetails: { relatedPlaylists: { uploads: `UU${channel.id.slice(2)}` } },
  });

  const fetchImpl = async (input: RequestInfo | URL): Promise<Response> => {
    if (networkDown) throw new TypeError("fetch failed");
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);

    if (url.hostname === "i.ytimg.com") {
      const [, , videoId = "", file = ""] = url.pathname.split("/");
      const size = file.replace(/\.jpg$/, "");
      if (!(setup.thumbnails?.[videoId] ?? []).includes(size)) return new Response("missing", { status: 404 });
      return new Response(new Uint8Array(5000).fill(7), { status: 200, headers: { "content-type": "image/jpeg" } });
    }
    if (url.hostname !== "www.googleapis.com") return new Response("not found", { status: 404 });

    const resource = url.pathname.split("/").pop() ?? "";
    const params = url.searchParams;
    calls.push({ resource, params });
    if (quotaLeft !== null) {
      if (quotaLeft <= 0) return apiError(403, "quotaExceeded", "youtube.quota");
      quotaLeft -= 1;
    }

    if (resource === "channels") {
      const handle = params.get("forHandle");
      const mine = params.get("mine") === "true";
      const matches = mine
        ? [...channels.values()]
        : handle !== null
          ? [...channels.values()].filter(
              (channel) => channel.handle.replace(/^@/, "").toLowerCase() === handle.replace(/^@/, "").toLowerCase(),
            )
          : (params.get("id") ?? "")
              .split(",")
              .map((id) => channels.get(id))
              .filter((channel): channel is FakeChannel => Boolean(channel));
      return json(200, {
        pageInfo: { totalResults: matches.length, resultsPerPage: 5 },
        ...(matches.length > 0 ? { items: matches.map(channelItem) } : {}),
      });
    }

    if (resource === "playlists") {
      const playlistId = params.get("id") ?? "";
      const channelId = setup.playlists?.[playlistId];
      return json(200, channelId ? { items: [{ id: playlistId, snippet: { channelId } }] } : { pageInfo: { totalResults: 0 } });
    }

    if (resource === "playlistItems") {
      const list = playlistVideos(params.get("playlistId") ?? "");
      if (!list) return apiError(404, "playlistNotFound");
      const offset = Number(params.get("pageToken") ?? "0");
      const pageSize = Number(params.get("maxResults") ?? "5");
      const page = list.slice(offset, offset + pageSize);
      const next = offset + pageSize < list.length ? String(offset + pageSize) : null;
      return json(200, {
        items: page.map((video) => ({ contentDetails: { videoId: video.id, videoPublishedAt: video.publishedAt } })),
        ...(next ? { nextPageToken: next } : {}),
        pageInfo: { totalResults: list.length, resultsPerPage: pageSize },
      });
    }

    if (resource === "videos") {
      const items = (params.get("id") ?? "")
        .split(",")
        .map((id) => videos.find((video) => video.id === id))
        .filter((video): video is FakeVideo => Boolean(video))
        .map((video) => ({
          id: video.id,
          snippet: {
            title: video.title ?? `Vidéo ${video.id}`,
            description: "",
            publishedAt: video.publishedAt,
            liveBroadcastContent: video.live ?? "none",
            channelId: video.channelId,
            channelTitle: channels.get(video.channelId)?.title ?? video.channelId,
            thumbnails: { medium: { url: `https://i.ytimg.com/vi/${video.id}/mqdefault.jpg` } },
          },
          statistics: {
            viewCount: String(video.views ?? 0),
            ...(video.likes === null ? {} : { likeCount: String(video.likes ?? 0) }),
          },
          contentDetails: {
            duration: isoDuration(video.live && video.live !== "none" ? 0 : (video.durationSeconds ?? 600)),
          },
        }));
      return json(200, { items });
    }

    if (resource === "search") {
      const q = (params.get("q") ?? "").toLowerCase();
      const maxResults = Number(params.get("maxResults") ?? "25");
      const matches = videos.filter((video) => {
        const title = (video.title ?? `Vidéo ${video.id}`).toLowerCase();
        return !q || title.includes(q) || video.id.toLowerCase().includes(q);
      });
      const page = matches.slice(0, Number.isFinite(maxResults) && maxResults > 0 ? maxResults : 25);
      return json(200, {
        items: page.map((video) => ({
          id: { kind: "youtube#video", videoId: video.id },
          snippet: {
            title: video.title ?? `Vidéo ${video.id}`,
            channelId: video.channelId,
            channelTitle: channels.get(video.channelId)?.title ?? video.channelId,
            publishedAt: video.publishedAt,
            liveBroadcastContent: video.live ?? "none",
          },
        })),
      });
    }

    return apiError(404, "notFound");
  };

  return {
    fetch: vi.fn(fetchImpl),
    calls,
    count: (resource) => calls.filter((call) => call.resource === resource).length,
    setQuotaAfter: (callsLeft) => {
      quotaLeft = callsLeft;
    },
    setNetworkDown: (down) => {
      networkDown = down;
    },
    addVideo: (video) => {
      videos.push(video);
    },
    removeVideo: (videoId) => {
      videos = videos.filter((video) => video.id !== videoId);
    },
    setViews: (videoId, views) => {
      videos = videos.map((video) => (video.id === videoId ? { ...video, views } : video));
    },
  };
}
