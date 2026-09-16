import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const { filename, label } = (await request.json()) as { filename?: string; label?: string };
    if (!filename) return NextResponse.json({ error: "Missing filename or label" }, { status: 400 });
    const trimmed = label?.trim();
    if (!trimmed) return NextResponse.json({ error: "Missing filename or label" }, { status: 400 });
    if (trimmed.length > 100) return NextResponse.json({ error: "Label too long (max 100 characters)" }, { status: 400 });

    const id = filename.split(".")[0];
    const result = getDb().prepare("UPDATE face_reactions SET label = ? WHERE id = ?").run(trimmed, id);
    if (result.changes === 0) return NextResponse.json({ error: "Face not found" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Rename face error:", err);
    return NextResponse.json({ error: "Rename failed" }, { status: 500 });
  }
}
