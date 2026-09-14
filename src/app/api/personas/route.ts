import { NextRequest, NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import { getDb, parseDataUrl } from "@/lib/db";

type Angle = "front" | "left" | "right";
const ANGLES: Angle[] = ["front", "left", "right"];

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB, matches chat-uploads
const ALLOWED_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function GET() {
  const personas = getDb()
    .prepare("SELECT id, label, created_at FROM personas ORDER BY created_at DESC")
    .all() as { id: string; label: string; created_at: string }[];

  const photoRows = getDb().prepare("SELECT persona_id, angle FROM persona_photos").all() as {
    persona_id: string;
    angle: Angle;
  }[];
  const anglesByPersona = new Map<string, Set<Angle>>();
  for (const row of photoRows) {
    if (!anglesByPersona.has(row.persona_id)) anglesByPersona.set(row.persona_id, new Set());
    anglesByPersona.get(row.persona_id)!.add(row.angle);
  }

  return NextResponse.json(
    personas.map((p) => ({
      id: p.id,
      label: p.label,
      angles: ANGLES.filter((a) => anglesByPersona.get(p.id)?.has(a)),
    })),
  );
}

export async function POST(request: NextRequest) {
  try {
    const { label = "Personnage", photos } = (await request.json()) as {
      label?: string;
      photos?: Partial<Record<Angle, string>>;
    };

    // Validate and decode every photo up front — nothing gets written to the
    // DB if any one of them is oversized, an unsupported type, or malformed.
    const decoded: { angle: Angle; buffer: Buffer; mimeType: string }[] = [];
    for (const angle of ANGLES) {
      const dataUrl = photos?.[angle];
      if (!dataUrl) continue;
      const { buffer, mimeType } = parseDataUrl(dataUrl);
      if (buffer.length > MAX_BYTES) {
        return NextResponse.json({ error: `Photo "${angle}" too large (max ${MAX_BYTES} bytes)` }, { status: 400 });
      }
      if (!ALLOWED_MIMES.has(mimeType)) {
        return NextResponse.json({ error: `Unsupported type ${mimeType} for "${angle}"` }, { status: 400 });
      }
      decoded.push({ angle, buffer, mimeType });
    }

    const id = uuid();
    const db = getDb();
    const insertPersona = db.prepare("INSERT INTO personas (id, label) VALUES (?, ?)");
    const insertPhoto = db.prepare(
      "INSERT INTO persona_photos (id, persona_id, angle, mime_type, size, data) VALUES (?, ?, ?, ?, ?, ?)",
    );
    // Atomic: a persona is never left with a partial set of angles because a
    // later photo in the batch failed to insert.
    const createPersona = db.transaction(() => {
      insertPersona.run(id, label);
      for (const p of decoded) {
        insertPhoto.run(uuid(), id, p.angle, p.mimeType, p.buffer.length, p.buffer);
      }
    });
    createPersona();

    return NextResponse.json({ success: true, id, label });
  } catch (err) {
    console.error("Create persona error:", err);
    return NextResponse.json({ error: "Failed to create persona" }, { status: 500 });
  }
}
