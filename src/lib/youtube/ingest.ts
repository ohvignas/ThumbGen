import { getTypedSettings, updateSettings } from "@/lib/settings";
import { fetchMineChannel, resolveChannelInput } from "./api";
import { fetchChannelPeriod, fetchTopVideoAnalytics } from "./analytics";
import * as store from "./channel-store";
import { canStartChannelIngest } from "./connection";
import { generateChannelKnowledge } from "./knowledge";
import * as knowledge from "./knowledge-store";
import * as oauthStore from "./oauth-store";
import { channelRuntime } from "./runtime";
import { getValidAccessToken } from "./tokens";
import { ingestTranscripts } from "./transcripts";
import { syncChannel } from "./sync";

function logFailure(what: string, err: unknown) {
  console.error(`[channels] ${what}:`, err instanceof Error ? err.message : err);
}

export function startChannelIngest(): boolean {
  const runtime = channelRuntime();
  if (runtime.ingest) return false;
  if (!oauthStore.getOauth() && canStartChannelIngest()) oauthStore.ensureApiKeySession();
  runtime.ingest = runIngest()
    .catch((err) => {
      logFailure("ingest failed", err);
      oauthStore.setIngestProgress({
        status: "error",
        error: err instanceof Error ? err.message : "Analyse impossible",
      });
    })
    .finally(() => {
      runtime.ingest = null;
    });
  return true;
}

export async function runIngest(now = () => new Date()): Promise<void> {
  let token: string | null = null;
  try {
    token = await getValidAccessToken();
  } catch (err) {
    logFailure("oauth refresh", err);
  }

  const settings = getTypedSettings();
  if (!token) {
    const apiKey = settings.youtubeApiKey?.trim() ?? "";
    const input = settings.youtubePlaylistId.trim();
    if (!apiKey || !input) throw new Error("Ajoute la clé YouTube Data API et l'URL de ta chaîne, ou connecte Google.");
    oauthStore.ensureApiKeySession(now());
  } else if (!oauthStore.getOauth()) {
    throw new Error("Connecte d'abord YouTube");
  }

  oauthStore.setIngestProgress({
    status: "running",
    error: null,
    step: "videos",
    analysisDone: false,
  });

  const mine = token
    ? await fetchMineChannel(token)
    : await resolveChannelInput(settings.youtubeApiKey!.trim(), settings.youtubePlaylistId.trim()).then((resolved) =>
        resolved.status === "found" ? resolved.channel : null,
      );
  if (!mine) {
    throw new Error(
      token ? "Aucune chaîne YouTube sur ce compte Google" : "Chaîne YouTube introuvable. Vérifie l'URL dans Ma chaîne.",
    );
  }
  oauthStore.setOauthChannel({ youtubeChannelId: mine.youtubeChannelId, title: mine.title, handle: mine.handle });

  const handleUrl = mine.handle ? `https://www.youtube.com/${mine.handle}` : `https://www.youtube.com/channel/${mine.youtubeChannelId}`;
  if (getTypedSettings().youtubePlaylistId !== handleUrl) updateSettings({ youtubePlaylistId: handleUrl });

  const existing = store.getChannelByYoutubeId(mine.youtubeChannelId);
  const channel = existing ?? store.insertChannel(mine, { syncStatus: "syncing" }).channel;
  store.setMineChannel(channel.id);
  store.updateChannelDetails(channel.id, mine);

  oauthStore.setIngestProgress({ step: "videos" });
  let outcome = await syncChannel(channel.id, now, token);
  if (outcome.status === "busy") {
    await channelRuntime().running.get(channel.id);
    outcome = await syncChannel(channel.id, now, token);
  }
  if (outcome.status !== "done" && outcome.status !== "quota") {
    const message = outcome.status === "error" ? outcome.message : "Synchronisation des vidéos impossible";
    throw new Error(message);
  }
  const videoCount = store.getChannelListItem(channel.id)?.videoCount ?? 0;
  oauthStore.setIngestProgress({ videosTotal: videoCount, videosDone: videoCount, step: token ? "analytics" : "transcripts" });

  if (token) {
    try {
      const day28 = await fetchChannelPeriod(token, 28, now());
    knowledge.upsertChannelAnalytics({
      channel_id: channel.id,
      period: "28d",
      period_start: day28.start,
      period_end: day28.end,
      views: day28.values.views ?? null,
      estimated_minutes_watched: day28.values.estimatedMinutesWatched ?? null,
      average_view_duration: day28.values.averageViewDuration ?? null,
      average_view_percentage: day28.values.averageViewPercentage ?? null,
      subscribers_gained: day28.values.subscribersGained ?? null,
      subscribers_lost: day28.values.subscribersLost ?? null,
      fetchedAt: now().toISOString(),
    });
    const day365 = await fetchChannelPeriod(token, 365, now());
    knowledge.upsertChannelAnalytics({
      channel_id: channel.id,
      period: "365d",
      period_start: day365.start,
      period_end: day365.end,
      views: day365.values.views ?? null,
      estimated_minutes_watched: day365.values.estimatedMinutesWatched ?? null,
      average_view_duration: day365.values.averageViewDuration ?? null,
      average_view_percentage: day365.values.averageViewPercentage ?? null,
      subscribers_gained: day365.values.subscribersGained ?? null,
      subscribers_lost: day365.values.subscribersLost ?? null,
      fetchedAt: now().toISOString(),
    });
    const top = await fetchTopVideoAnalytics(token, 365, now());
    for (const row of top.rows) {
      if (!row.videoId || !store.getVideo(row.videoId)) continue;
      knowledge.upsertVideoAnalytics({
        video_id: row.videoId,
        period_start: top.start,
        period_end: top.end,
        views: row.values.views ?? null,
        engaged_views: row.values.engagedViews ?? null,
        estimated_minutes_watched: row.values.estimatedMinutesWatched ?? null,
        average_view_duration: row.values.averageViewDuration ?? null,
        average_view_percentage: row.values.averageViewPercentage ?? null,
        likes: row.values.likes ?? null,
        comments: row.values.comments ?? null,
        shares: row.values.shares ?? null,
        subscribers_gained: row.values.subscribersGained ?? null,
        fetchedAt: now().toISOString(),
      });
    }
  } catch (err) {
    logFailure("analytics", err);
  }
  }

  oauthStore.setIngestProgress({ step: "transcripts" });
  const transcripts = await ingestTranscripts(
    channel.id,
    (done, failed) => oauthStore.setIngestProgress({ transcriptsDone: done, transcriptsFailed: failed }),
    now,
  );
  oauthStore.setIngestProgress({
    transcriptsDone: transcripts.done,
    transcriptsFailed: transcripts.failed,
    step: "analysis",
  });

  await generateChannelKnowledge(channel.id, undefined, now);
  oauthStore.setIngestProgress({
    status: "idle",
    step: "done",
    analysisDone: true,
    lastIngestAt: now().toISOString(),
    error: null,
  });
}
