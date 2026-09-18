import { YoutubeTranscript } from "youtube-transcript";
import * as knowledge from "./knowledge-store";
import { youtubeWatchUrl } from "./types";

export const TRANSCRIPT_CONCURRENCY = 2;

function transcriptText(segments: Array<{ text?: string }>): string {
  return segments
    .map((segment) => segment.text ?? "")
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function fetchPublicTranscript(videoId: string): Promise<{ text: string; language: string | null } | null> {
  try {
    const segments = await YoutubeTranscript.fetchTranscript(youtubeWatchUrl(videoId));
    const text = transcriptText(segments);
    if (!text) return null;
    return { text, language: null };
  } catch {
    return null;
  }
}

export async function ingestTranscripts(
  channelId: string,
  onProgress: (done: number, failed: number) => void,
  now = () => new Date(),
): Promise<{ done: number; failed: number }> {
  const pending = knowledge.videosMissingTranscript(channelId);
  let done = 0;
  let failed = 0;
  for (let i = 0; i < pending.length; i += TRANSCRIPT_CONCURRENCY) {
    const batch = pending.slice(i, i + TRANSCRIPT_CONCURRENCY);
    await Promise.all(
      batch.map(async (videoId) => {
        const fetched = await fetchPublicTranscript(videoId);
        const stamp = now().toISOString();
        if (fetched) {
          knowledge.upsertTranscript({
            videoId,
            source: "timedtext",
            language: fetched.language,
            text: fetched.text,
            fetchedAt: stamp,
          });
          done += 1;
        } else {
          knowledge.upsertTranscript({
            videoId,
            source: "none",
            language: null,
            text: "",
            fetchedAt: stamp,
          });
          failed += 1;
        }
      }),
    );
    onProgress(done, failed);
  }
  const counts = knowledge.countTranscripts(channelId);
  return { done: counts.done, failed: counts.failed };
}
