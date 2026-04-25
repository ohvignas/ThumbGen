import { NextResponse } from "next/server";
import { getSetting } from "@/lib/settings";
import { resolveUploadsPlaylistId } from "@/lib/youtube/channel";

type PlaylistItem = {
  videoId: string;
  title: string;
  thumbnailUrl: string;
  addedAt: string;
};

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
