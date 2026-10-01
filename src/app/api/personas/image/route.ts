import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { bufferedImageResponse } from "@/lib/images/buffered-image-response";

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  const angle = request.nextUrl.searchParams.get("angle");
  if (!id || !angle) return NextResponse.json({ error: "Missing id or angle" }, { status: 400 });

  const row = getDb()
    .prepare("SELECT mime_type, data FROM persona_photos WHERE persona_id = ? AND angle = ?")
    .get(id, angle) as { mime_type: string; data: Buffer } | undefined;
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Not "immutable": a retake (POST /api/personas/[id]/photos) overwrites
  // the bytes at this same (persona_id, angle) URL.
  return bufferedImageResponse(row.data, row.mime_type, "private, max-age=60, must-revalidate");
}
