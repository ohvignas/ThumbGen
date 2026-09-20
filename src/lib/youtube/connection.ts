import type { YoutubeConnectionPublic } from "./connection-types";
import { oauthClientConfigured } from "./oauth";
import { getOauth } from "./oauth-store";
import { getKnowledge, mineChannelId } from "./knowledge-store";
import { getTypedSettings } from "@/lib/settings";

export function canStartChannelIngest(): boolean {
  if (getOauth()?.refresh_token) return true;
  const { youtubeApiKey, youtubePlaylistId } = getTypedSettings();
  return Boolean(youtubeApiKey?.trim() && youtubePlaylistId.trim());
}

export function readConnectionPublic(): YoutubeConnectionPublic {
  const oauth = getOauth();
  const channelId = mineChannelId();
  const knowledge = channelId ? getKnowledge(channelId) : null;
  return {
    oauthConfigured: oauthClientConfigured(),
    canIngest: canStartChannelIngest(),
    connected: Boolean(oauth?.refresh_token || oauth?.channel_youtube_id),
    channelTitle: oauth?.channel_title ?? null,
    channelHandle: oauth?.channel_handle ?? null,
    channelYoutubeId: oauth?.channel_youtube_id ?? null,
    connectedAt: oauth?.connected_at ?? null,
    ingest: {
      status: oauth?.ingest_status ?? "idle",
      step: oauth?.ingest_step ?? null,
      error: oauth?.ingest_error ?? null,
      videosTotal: oauth?.videos_total ?? 0,
      videosDone: oauth?.videos_done ?? 0,
      transcriptsDone: oauth?.transcripts_done ?? 0,
      transcriptsFailed: oauth?.transcripts_failed ?? 0,
      analysisDone: oauth?.analysis_done === 1,
      lastIngestAt: oauth?.last_ingest_at ?? null,
    },
    knowledge: knowledge
      ? {
          generatedAt: knowledge.generated_at,
          documentMd: knowledge.document_md,
          videoCount: knowledge.video_count,
          transcriptCount: knowledge.transcript_count,
        }
      : null,
  };
}
