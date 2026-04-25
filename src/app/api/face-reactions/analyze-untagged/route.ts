import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { tagFaceImage } from "@/lib/agent/vision";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Backfills emotion tags on every face_reactions row that doesn't have any.
 * Idempotent — already-tagged rows are skipped. Sequential so we don't burst
 * the Anthropic API; one image per second is plenty.
 */
export async function POST() {
  const rows = getDb()
    .prepare("SELECT id, label, mime_type, data FROM face_reactions WHERE tags IS NULL OR tags = ''")
    .all() as { id: string; label: string; mime_type: string; data: Buffer }[];

  if (rows.length === 0) {
    return NextResponse.json({ analyzed: 0, total: 0, message: "Aucune image à analyser." });
  }

  const update = getDb().prepare("UPDATE face_reactions SET tags = ?, label = ? WHERE id = ?");
  let success = 0;
  const failures: Array<{ id: string; error: string }> = [];

  for (const r of rows) {
    try {
      const tags = await tagFaceImage(r.data, r.mime_type);
      const newLabel = r.label === "Face" && tags.emotions[0] ? tags.emotions[0].slice(0, 24) : r.label;
      update.run(JSON.stringify(tags), newLabel, r.id);
      success++;
    } catch (e) {
      failures.push({ id: r.id, error: (e as Error).message });
    }
  }

  return NextResponse.json({
    analyzed: success,
    total: rows.length,
    failed: failures.length,
    failures: failures.slice(0, 5),
  });
}
