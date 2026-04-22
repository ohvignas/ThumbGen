import { NextResponse } from "next/server";
import { getSetting } from "@/lib/settings";

type PlaylistItem = {
  videoId: string;
  title: string;
  thumbnailUrl: string;
  addedAt: string;
};

/**
 * Extract channel handle or ID from various YouTube URL formats:
 * - https://www.youtube.com/@handle
 * - https://youtube.com/@handle
 * - https://www.youtube.com/channel/UCxxxxxx
 * - https://www.youtube.com/c/channelname
 * - @handle (just the handle)
 */
function parseChannelInput(input: string): { type: "handle" | "channelId"; value: string } | null {
  const trimmed = input.trim();

  // Direct handle: @something
  if (trimmed.startsWith("@")) {
    return { type: "handle", value: trimmed };
  }

  // Playlist ID: starts with PL or UU
  if (trimmed.startsWith("PL") || trimmed.startsWith("UU")) {
    return null; // Let it be used as playlist ID directly
  }

  try {
    const url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);

    // youtube.com/@handle
    const handleMatch = url.pathname.match(/^\/@([^/]+)/);
    if (handleMatch) {
      return { type: "handle", value: `@${handleMatch[1]}` };
    }

    // youtube.com/channel/UCxxxxxx
    const channelMatch = url.pathname.match(/^\/channel\/(UC[^/]+)/);
    if (channelMatch) {
      return { type: "channelId", value: channelMatch[1] };
    }

    // youtube.com/c/channelname
    const cMatch = url.pathname.match(/^\/c\/([^/]+)/);
    if (cMatch) {
      return { type: "handle", value: `@${cMatch[1]}` };
    }
  } catch {
    // Not a URL
  }

  return null;
}

async function resolveUploadsPlaylistId(apiKey: string, input: string): Promise<string | null> {
  const parsed = parseChannelInput(input);

  // If it looks like a playlist ID already, use it directly
  if (!parsed) return input;

  let channelId: string;

  if (parsed.type === "channelId") {
    channelId = parsed.value;
  } else {
    // Resolve handle to channel ID
    const params = new URLSearchParams({
      part: "id",
      forHandle: parsed.value.replace("@", ""),
      key: apiKey,
    });
    const res = await fetch(`https://www.googleapis.com/youtube/v3/channels?${params}`);
    if (!res.ok) return null;
    const data = await res.json();
    channelId = data.items?.[0]?.id;
    if (!channelId) return null;
  }

  // Convert channel ID (UCxxxxxx) to uploads playlist (UUxxxxxx)
  return channelId.replace(/^UC/, "UU");
}

export async function GET() {
  const API_KEY = getSetting("youtubeApiKey");
  const channelInput = getSetting("youtubePlaylistId"); // Now accepts URL or playlist ID

  if (!API_KEY || !channelInput) {
    return NextResponse.json({ items: [], configured: false });
  }

  try {
    const playlistId = await resolveUploadsPlaylistId(API_KEY, channelInput);
    if (!playlistId) {
      return NextResponse.json({ items: [], error: "Could not find this YouTube channel" });
    }

    const items: PlaylistItem[] = [];
    let pageToken: string | undefined;

    do {
      const params = new URLSearchParams({
        part: "snippet",
        playlistId,
        maxResults: "50",
        key: API_KEY,
      });
      if (pageToken) params.set("pageToken", pageToken);

      const res = await fetch(
        `https://www.googleapis.com/youtube/v3/playlistItems?${params.toString()}`
      );

      if (!res.ok) {
        const err = await res.json();
        console.error("YouTube API error:", err);
        return NextResponse.json({ items: [], error: "YouTube API error" });
      }

      const data = await res.json();

      for (const item of data.items || []) {
        const videoId = item.snippet?.resourceId?.videoId;
        if (!videoId) continue;

        items.push({
          videoId,
          title: item.snippet.title || "Untitled",
          thumbnailUrl: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
          addedAt: item.snippet.publishedAt || "",
        });
      }

      pageToken = data.nextPageToken;
    } while (pageToken);

    return NextResponse.json({ items, configured: true });
  } catch (err) {
    console.error("YouTube API error:", err);
    return NextResponse.json({ items: [], error: "YouTube API error" });
  }
}
