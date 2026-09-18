import { getDb } from "@/lib/db";

export type CompetitorHit = {
  videoId: string;
  title: string;
  channel: string;
  channelId: string;
  lang: "fr" | "en";
  views: number;
  score: number | null;
  ageDays: number;
  searchRank: number;
  viral: boolean;
};

type Row = { data: string; searched_at: string };

export function saveCompetitorSearch(conversationId: string, hits: CompetitorHit[]): void {
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO competitor_search_results (conversation_id, data, searched_at) VALUES (?, ?, ?)
       ON CONFLICT(conversation_id) DO UPDATE SET data = excluded.data, searched_at = excluded.searched_at`,
    )
    .run(conversationId, JSON.stringify(hits), now);
}

export function getCompetitorSearch(conversationId: string): CompetitorHit[] | null {
  const row = getDb()
    .prepare("SELECT data, searched_at FROM competitor_search_results WHERE conversation_id = ?")
    .get(conversationId) as Row | undefined;
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.data) as unknown;
    return Array.isArray(parsed) ? (parsed as CompetitorHit[]) : null;
  } catch {
    return null;
  }
}
