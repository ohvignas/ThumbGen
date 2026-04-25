import { NextRequest, NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing 'file' field" }, { status: 400 });
    }
    if (file.size === 0) {
      return NextResponse.json({ error: "Empty file" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: `Too large (max ${MAX_BYTES} bytes)` }, { status: 400 });
    }
    if (!ALLOWED_MIMES.has(file.type)) {
      return NextResponse.json(
        { error: `Unsupported type ${file.type} (allowed: ${[...ALLOWED_MIMES].join(", ")})` },
        { status: 400 },
      );
    }

    const id = `up_${uuid().replace(/-/g, "")}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    getDb()
      .prepare("INSERT INTO chat_uploads (id, mime_type, size, data) VALUES (?, ?, ?, ?)")
      .run(id, file.type, buffer.length, buffer);

    return NextResponse.json({
      id,
      source: `uploaded:${id}`,
      size: buffer.length,
      mimeType: file.type,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || "Upload failed" }, { status: 500 });
  }
}
