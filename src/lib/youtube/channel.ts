/**
 * Shared YouTube channel utilities.
 *
 * Used by:
 *  - src/app/api/youtube/playlist/route.ts
 *  - src/lib/agent/tools/search-youtube-channel.ts
 *  - src/lib/agent/tools/get-channel-videos.ts
 */

/**
 * Extract channel handle or ID from various YouTube URL formats:
 * - https://www.youtube.com/@handle
 * - https://youtube.com/@handle
 * - https://www.youtube.com/channel/UCxxxxxx
 * - https://www.youtube.com/c/channelname
 * - @handle (just the handle)
 */
export function parseChannelInput(
  input: string
): { type: "handle" | "channelId"; value: string } | null {
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

/**
 * Resolves a user-provided channel string (handle, URL, or raw channel ID)
 * to a YouTube channel ID. Returns `{ ok: false, error }` when:
 *  - the string can't be parsed AND doesn't look like a UC… channel ID
 *  - the YouTube API call fails
 *  - the handle doesn't resolve to any channel
 */
export async function resolveChannelId(
  apiKey: string,
  channel: string
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const parsed = parseChannelInput(channel);

  // Unparseable: only accept it as-is if it looks like a raw channel ID
  if (!parsed) {
    if (/^UC[\w-]{20,}$/.test(channel.trim())) {
      return { ok: true, id: channel.trim() };
    }
    return { ok: false, error: `Cannot parse channel: ${channel}` };
  }

  if (parsed.type === "channelId") {
    return { ok: true, id: parsed.value };
  }

  // Handle → channel ID via YouTube Data API
  const params = new URLSearchParams({
    part: "id",
    forHandle: parsed.value.replace("@", ""),
    key: apiKey,
  });
  let res: Response;
  try {
    res = await fetch(`https://www.googleapis.com/youtube/v3/channels?${params}`);
  } catch (e) {
    return { ok: false, error: `Network error: ${(e as Error).message}` };
  }
  if (!res.ok) return { ok: false, error: `Channel lookup failed: ${res.status}` };
  const data = await res.json();
  const id = data.items?.[0]?.id;
  if (!id) return { ok: false, error: `No channel found for handle ${parsed.value}` };
  return { ok: true, id };
}

export async function resolveUploadsPlaylistId(
  apiKey: string,
  input: string
): Promise<string | null> {
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
