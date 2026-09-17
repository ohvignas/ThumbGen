import { getTypedSettings } from "@/lib/settings";
import { fetchChannelDetails, localChannelId, resolveChannelInput, YouTubeApiError } from "./api";
import * as store from "./channel-store";
import { startChannelSync } from "./jobs";
import { channelRuntime } from "./runtime";
import type { ChannelDetails } from "./types";

export type MyChannelResult = { changed: boolean; addedChannelId: string | null };

const UNCHANGED: MyChannelResult = { changed: false, addedChannelId: null };

/**
 * Keeps « Ma chaîne » in line with Réglages → Ma chaîne (youtubePlaylistId):
 * follows that channel (is_mine = 1, background import) and removes the flag
 * from any previous one, which stays followed. Handles and playlists are
 * resolved once per server process; channel ids need no request.
 */
export async function reconcileMyChannel(): Promise<MyChannelResult> {
  const { youtubeApiKey, youtubePlaylistId } = getTypedSettings();
  const input = youtubePlaylistId.trim();
  if (!input) return { changed: store.setMineChannel(null), addedChannelId: null };
  if (!youtubeApiKey) return UNCHANGED;

  const runtime = channelRuntime();
  try {
    let details: ChannelDetails | null = null;
    let youtubeChannelId: string | null;
    if (runtime.myChannel?.input === input) {
      youtubeChannelId = runtime.myChannel.youtubeChannelId;
    } else {
      youtubeChannelId = localChannelId(input);
      if (!youtubeChannelId) {
        const resolved = await resolveChannelInput(youtubeApiKey, input);
        details = resolved.status === "found" ? resolved.channel : null;
        youtubeChannelId = details?.youtubeChannelId ?? null;
      }
      runtime.myChannel = { input, youtubeChannelId };
    }
    if (!youtubeChannelId) return { changed: store.setMineChannel(null), addedChannelId: null };

    const existing = store.getChannelByYoutubeId(youtubeChannelId);
    if (existing) return { changed: store.setMineChannel(existing.id), addedChannelId: null };

    details ??= await fetchChannelDetails(youtubeApiKey, youtubeChannelId);
    if (!details) return UNCHANGED;
    // A newly followed channel shows « Synchronisation… » straight away.
    const { channel, inserted } = store.insertChannel(details, { syncStatus: "syncing" });
    const moved = store.setMineChannel(channel.id);
    if (inserted) startChannelSync(channel.id);
    return { changed: moved || inserted, addedChannelId: inserted ? channel.id : null };
  } catch (err) {
    if (err instanceof YouTubeApiError) {
      console.warn(`[channels] « Ma chaîne » non résolue : ${err.message}`);
      return UNCHANGED;
    }
    throw err;
  }
}
