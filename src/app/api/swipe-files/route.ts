import { NextRequest, NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import { getDb, parseDataUrl } from "@/lib/db";

// GET /api/swipe-files — list all uploaded swipe files
export async function GET() {
  const rows = getDb()
    .prepare("SELECT id, title, size FROM swipe_files ORDER BY created_at ASC")
    .all() as { id: string; title: string; size: number }[];
  // Keep "filename" key in the response for backwards compatibility with existing UI
  return NextResponse.json(rows.map((r) => ({ filename: r.id, title: r.title, size: r.size })));
}

export async function POST(request: NextRequest) {
  try {
    const { dataUrl, title = "Reference" } = await request.json();
    if (!dataUrl) return NextResponse.json({ error: "No dataUrl provided" }, { status: 400 });

    const { buffer, mimeType } = parseDataUrl(dataUrl);
    const id = uuid();
    getDb()
      .prepare("INSERT INTO swipe_files (id, title, mime_type, size, data) VALUES (?, ?, ?, ?, ?)")
      .run(id, title, mimeType, buffer.length, buffer);

    return NextResponse.json({ success: true, filename: id });
  } catch (err) {
    console.error("Upload swipe file error:", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const filename = request.nextUrl.searchParams.get("filename");
    if (!filename) return NextResponse.json({ error: "No filename" }, { status: 400 });
    // legacy: filename may be "<id>.<ext>"
    const id = filename.split(".")[0];
    getDb().prepare("DELETE FROM swipe_files WHERE id = ?").run(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Delete swipe file error:", err);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
