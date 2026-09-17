import { getTypedSettings } from "@/lib/settings";
import { fetchChannelDetails, localChannelId, resolveChannelInput, YouTubeApiError } from "./api";
import * as store from "./channel-store";
import { startChannelSync } from "./jobs";
import { channelRuntime, isQuotaBlocked, markQuotaBlocked } from "./runtime";
import type { ChannelDetails } from "./types";

export type MyChannelResult = { changed: boolean; addedChannelId: string | null };

const UNCHANGED: MyChannelResult = { changed: false, addedChannelId: null };

/** GET /api/channels polls every 3 s: an input YouTube does not know, or a failing call, is not retried on each poll. */
export const MY_CHANNEL_NOT_FOUND_BACKOFF_MS = 60 * 60 * 1000;
export const MY_CHANNEL_ERROR_BACKOFF_MS = 10 * 60 * 1000;

function notMine(): MyChannelResult {
  return { changed: store.setMineChannel(null), addedChannelId: null };
}

/**
 * Keeps « Ma chaîne » in line with Réglages → Ma chaîne (youtubePlaylistId):
 * follows that channel (is_mine = 1, background import) and removes the flag
 * from any previous one, which stays followed. Handles and playlists are
 * resolved once per server process; channel ids need no request. An input
 * that is not found is retried after an hour, a YouTube error after 10
 * minutes, and nothing is asked while the quota is exhausted.
 */
export async function reconcileMyChannel(now: Date = new Date()): Promise<MyChannelResult> {
  const { youtubeApiKey, youtubePlaylistId } = getTypedSettings();
  const input = youtubePlaylistId.trim();
  if (!input) return notMine();
  if (!youtubeApiKey) return UNCHANGED;

  const runtime = channelRuntime();
  const backoff = runtime.myChannelBackoff;
  if (backoff?.input === input && now.getTime() < backoff.until) return backoff.notFound ? notMine() : UNCHANGED;

  const skip = (notFound: boolean, delayMs: number): MyChannelResult => {
    runtime.myChannelBackoff = { input, until: now.getTime() + delayMs, notFound };
    return notFound ? notMine() : UNCHANGED;
  };

  try {
    let details: ChannelDetails | null = null;
    let youtubeChannelId: string | null;
    if (runtime.myChannel?.input === input) {
      youtubeChannelId = runtime.myChannel.youtubeChannelId;
    } else {
      youtubeChannelId = localChannelId(input);
      if (!youtubeChannelId) {
        if (isQuotaBlocked(now)) return UNCHANGED;
        const resolved = await resolveChannelInput(youtubeApiKey, input);
        if (resolved.status !== "found") return skip(true, MY_CHANNEL_NOT_FOUND_BACKOFF_MS);
        details = resolved.channel;
        youtubeChannelId = details.youtubeChannelId;
      }
      runtime.myChannel = { input, youtubeChannelId };
    }
    if (!youtubeChannelId) return notMine();

    const existing = store.getChannelByYoutubeId(youtubeChannelId);
    if (existing) return { changed: store.setMineChannel(existing.id), addedChannelId: null };

    if (!details) {
      if (isQuotaBlocked(now)) return UNCHANGED;
      details = await fetchChannelDetails(youtubeApiKey, youtubeChannelId);
      if (!details) return skip(true, MY_CHANNEL_NOT_FOUND_BACKOFF_MS);
    }
    // A newly followed channel shows « Synchronisation… » straight away.
    const { channel, inserted } = store.insertChannel(details, { syncStatus: "syncing" });
    const moved = store.setMineChannel(channel.id);
    if (inserted) startChannelSync(channel.id);
    runtime.myChannelBackoff = null;
    return { changed: moved || inserted, addedChannelId: inserted ? channel.id : null };
  } catch (err) {
    if (err instanceof YouTubeApiError) {
      console.warn(`[channels] « Ma chaîne » non résolue : ${err.message}`);
      if (err.isQuota) markQuotaBlocked(now);
      return skip(false, MY_CHANNEL_ERROR_BACKOFF_MS);
    }
    throw err;
  }
}
