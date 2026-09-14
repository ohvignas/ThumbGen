import { NextRequest, NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import { getDb, parseDataUrl } from "@/lib/db";

type Angle = "front" | "left" | "right";
const VALID_ANGLES: Angle[] = ["front", "left", "right"];

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB, matches chat-uploads
const ALLOWED_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);

// Upsert one angle's photo — used for retakes and for adding an angle after
// persona creation.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { angle, dataUrl } = (await request.json()) as { angle?: Angle; dataUrl?: string };

    if (!angle || !VALID_ANGLES.includes(angle)) {
      return NextResponse.json({ error: "Invalid angle" }, { status: 400 });
    }
    if (!dataUrl) {
      return NextResponse.json({ error: "No dataUrl provided" }, { status: 400 });
    }

    const persona = getDb().prepare("SELECT id FROM personas WHERE id = ?").get(id);
    if (!persona) return NextResponse.json({ error: "Persona not found" }, { status: 404 });

    const { buffer, mimeType } = parseDataUrl(dataUrl);
    if (buffer.length > MAX_BYTES) {
      return NextResponse.json({ error: `Too large (max ${MAX_BYTES} bytes)` }, { status: 400 });
    }
    if (!ALLOWED_MIMES.has(mimeType)) {
      return NextResponse.json({ error: `Unsupported type ${mimeType}` }, { status: 400 });
    }
    getDb()
      .prepare(
        `INSERT INTO persona_photos (id, persona_id, angle, mime_type, size, data)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(persona_id, angle) DO UPDATE SET
           mime_type = excluded.mime_type, size = excluded.size, data = excluded.data, created_at = datetime('now')`,
      )
      .run(uuid(), id, angle, mimeType, buffer.length, buffer);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Save persona photo error:", err);
    return NextResponse.json({ error: "Failed to save photo" }, { status: 500 });
  }
}
