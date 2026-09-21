import { slashRemainderAfterInvoke } from "@/lib/agent/skills/slash-query";
import { formatMyChannelKnowledge } from "@/lib/agent/tools/get-my-channel-knowledge";
import { getDb } from "@/lib/db";
import { retrieveOwnCorpus } from "@/lib/studio/corpus";
import { getStudioVideo, listStudioVideos } from "@/lib/studio/store";
import { isWritingProjectId, videoIdFromWritingProject, type CorpusHit } from "@/lib/studio/types";
import { mineChannelId } from "@/lib/youtube/knowledge-store";

export const DEFAULT_STUDIO_CORPUS_QUERY = "dernières vidéos";

export function studioFirstTurnQuery(userText: string): string {
  const remainder = slashRemainderAfterInvoke(userText).slice(0, 200);
  return remainder || DEFAULT_STUDIO_CORPUS_QUERY;
}

function clip(text: string, max = 180): string {
  return text.replace(/\s+/g, " ").trim().slice(0, max);
}

function formatCorpusHits(hits: CorpusHit[]): string {
  if (hits.length === 0) {
    return "Aucun résultat local. Corpus mince — importe d’anciens scripts ou connecte Ma chaîne.";
  }
  const lines = hits.map((hit) => {
    const id =
      hit.source === "studio" && hit.videoId
        ? `studio:${hit.videoId}`
        : hit.youtubeVideoId
          ? `youtube:${hit.youtubeVideoId}`
          : hit.source;
    return `- ${id} [${hit.source}/${hit.kind}] — "${hit.title}" — ${clip(hit.snippet)}`;
  });
  return `${hits.length} extrait(s) :\n${lines.join("\n")}`;
}

function recentChannelHits(limit: number): CorpusHit[] {
  const mine = mineChannelId();
  if (!mine) return [];
  const rows = getDb()
    .prepare(
      `SELECT v.video_id AS videoId, v.title AS title,
              substr(COALESCE(t.text, v.description, ''), 1, 180) AS snippet
       FROM channel_videos v
       LEFT JOIN video_transcripts t ON t.video_id = v.video_id
       WHERE v.channel_id = ?
       ORDER BY v.published_at DESC
       LIMIT ?`,
    )
    .all(mine, limit) as Array<{ videoId: string; title: string; snippet: string }>;
  return rows.map((row) => ({
    source: "channel" as const,
    youtubeVideoId: row.videoId,
    title: row.title,
    snippet: clip(row.snippet || row.title),
    kind: "transcript" as const,
  }));
}

function recentStudioHits(limit: number): CorpusHit[] {
  return listStudioVideos()
    .slice(0, limit)
    .map((video) => ({
      source: "studio" as const,
      videoId: video.videoId,
      youtubeVideoId: video.youtubeVideoId ?? undefined,
      title: video.title,
      snippet: clip(video.draft.script || video.draft.description || video.title),
      kind: (video.draft.script ? "script" : "title") as CorpusHit["kind"],
    }));
}

function retrieveFirstTurnCorpus(query: string, limit = 8): CorpusHit[] {
  const searched = retrieveOwnCorpus(query, limit);
  if (searched.length > 0) return searched;
  const seen = new Set<string>();
  const hits: CorpusHit[] = [];
  for (const hit of [...recentChannelHits(limit), ...recentStudioHits(limit)]) {
    const key = hit.youtubeVideoId ?? (hit.videoId ? `studio:${hit.videoId}` : hit.title);
    if (seen.has(key)) continue;
    seen.add(key);
    hits.push(hit);
    if (hits.length >= limit) break;
  }
  return hits;
}

function formatListedVideos(): string {
  const rows = listStudioVideos();
  if (rows.length === 0) return "Aucune fiche vidéo.";
  return `${rows.length} fiche(s) :\n${rows
    .map((row) => `- studio:${row.videoId} — "${row.title}" — ${row.etiquette ?? "—"}`)
    .join("\n")}`;
}

function formatOpenFiche(projectId: string): string {
  const videoId = videoIdFromWritingProject(projectId);
  if (!videoId) return "Pas de fiche ouverte.";
  const video = getStudioVideo(videoId);
  if (!video) return `Fiche ${videoId} introuvable.`;
  return `studio:${video.videoId} — "${video.title}"`;
}

/** Local tool results for the first writing turn — no paid API, no YouTube quota. */
export function buildStudioFirstTurnBlock(projectId: string, userText = ""): string | null {
  if (!isWritingProjectId(projectId)) return null;
  const query = studioFirstTurnQuery(userText);
  return [
    "<studio_first_turn>",
    "These tool results were already retrieved for this first writing turn (get_my_channel_knowledge + retrieve_own_corpus + list_studio_videos + get_studio_video). Treat them as already ran. Quote these hits, then ask production format with ask_user (studio_format). Do not announce a later read of the channel or last videos.",
    "",
    "<get_my_channel_knowledge>",
    formatMyChannelKnowledge(),
    "</get_my_channel_knowledge>",
    "",
    `<retrieve_own_corpus query="${query}">`,
    formatCorpusHits(retrieveFirstTurnCorpus(query)),
    "</retrieve_own_corpus>",
    "",
    "<list_studio_videos>",
    formatListedVideos(),
    "</list_studio_videos>",
    "",
    "<get_studio_video>",
    formatOpenFiche(projectId),
    "</get_studio_video>",
    "</studio_first_turn>",
  ].join("\n");
}
