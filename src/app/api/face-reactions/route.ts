import { NextRequest, NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import { getDb, parseDataUrl } from "@/lib/db";
import { tagFaceImage } from "@/lib/agent/vision";

export async function GET() {
  const rows = getDb()
    .prepare("SELECT id, label, size, tags FROM face_reactions ORDER BY created_at ASC")
    .all() as { id: string; label: string; size: number; tags: string | null }[];
  return NextResponse.json(
    rows.map((r) => ({ filename: r.id, label: r.label, size: r.size, tags: r.tags ? JSON.parse(r.tags) : null })),
  );
}

export async function POST(request: NextRequest) {
  try {
    const { dataUrl, label = "Face" } = await request.json();
    if (!dataUrl) return NextResponse.json({ error: "No dataUrl provided" }, { status: 400 });

    const { buffer, mimeType } = parseDataUrl(dataUrl);
    const id = uuid();

    // Auto-tag the face on upload via Claude vision (one-shot, persistent).
    // If the API key isn't configured or the call fails, save the row anyway
    // and leave tags null — the backfill endpoint can retry later.
    let tagsJson: string | null = null;
    let derivedLabel = label;
    try {
      const tags = await tagFaceImage(buffer, mimeType);
      tagsJson = JSON.stringify(tags);
      // If the user kept the default "Face" label, promote the dominant emotion
      // so the existing UI shows something meaningful.
      if (label === "Face" && tags.emotions[0]) {
        derivedLabel = tags.emotions[0].slice(0, 24);
      }
    } catch (e) {
      console.warn("Face tagging failed (will retry via backfill):", (e as Error).message);
    }

    getDb()
      .prepare("INSERT INTO face_reactions (id, label, mime_type, size, data, tags) VALUES (?, ?, ?, ?, ?, ?)")
      .run(id, derivedLabel, mimeType, buffer.length, buffer, tagsJson);

    return NextResponse.json({ success: true, filename: id, label: derivedLabel, tags: tagsJson ? JSON.parse(tagsJson) : null });
  } catch (err) {
    console.error("Upload face error:", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const filename = request.nextUrl.searchParams.get("filename");
    if (!filename) return NextResponse.json({ error: "No filename" }, { status: 400 });
    const id = filename.split(".")[0];
    getDb().prepare("DELETE FROM face_reactions WHERE id = ?").run(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Delete face error:", err);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
