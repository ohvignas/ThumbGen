import { getDb } from "@/lib/db";
import { thumbAnalysisSchema, type ThumbAnalysis } from "./schema";

type Row = { data: string; analyzed_at: string };

export function getThumbnailAnalysis(videoId: string): { analysis: ThumbAnalysis; analyzedAt: string } | null {
  const row = getDb().prepare("SELECT data, analyzed_at FROM thumbnail_analyses WHERE video_id = ?").get(videoId) as Row | undefined;
  if (!row) return null;
  try {
    const parsed = thumbAnalysisSchema.safeParse(JSON.parse(row.data));
    return parsed.success ? { analysis: parsed.data, analyzedAt: row.analyzed_at } : null;
  } catch {
    return null;
  }
}

export function saveThumbnailAnalysis(videoId: string, analysis: ThumbAnalysis): void {
  const parsed = thumbAnalysisSchema.safeParse(analysis);
  if (!parsed.success) return;
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO thumbnail_analyses (video_id, data, analyzed_at) VALUES (?, ?, ?)
       ON CONFLICT(video_id) DO UPDATE SET data = excluded.data, analyzed_at = excluded.analyzed_at`,
    )
    .run(videoId, JSON.stringify(parsed.data), now);
}
