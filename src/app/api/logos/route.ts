import { NextRequest, NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import { getDb, parseDataUrl } from "@/lib/db";

export async function GET() {
  const rows = getDb()
    .prepare("SELECT id, label, size FROM logos ORDER BY created_at ASC")
    .all() as { id: string; label: string; size: number }[];
  return NextResponse.json(rows.map((r) => ({ filename: r.id, label: r.label, size: r.size })));
}

export async function POST(request: NextRequest) {
  try {
    const { dataUrl, label = "Logo" } = await request.json();
    if (!dataUrl) return NextResponse.json({ error: "No dataUrl provided" }, { status: 400 });

    const { buffer, mimeType } = parseDataUrl(dataUrl);
    const id = uuid();
    getDb()
      .prepare("INSERT INTO logos (id, label, mime_type, size, data) VALUES (?, ?, ?, ?, ?)")
      .run(id, label, mimeType, buffer.length, buffer);

    return NextResponse.json({ success: true, filename: id });
  } catch (err) {
    console.error("Upload logo error:", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const filename = request.nextUrl.searchParams.get("filename");
    if (!filename) return NextResponse.json({ error: "No filename" }, { status: 400 });
    const id = filename.split(".")[0];
    getDb().prepare("DELETE FROM logos WHERE id = ?").run(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Delete logo error:", err);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
