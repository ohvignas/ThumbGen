import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { bufferedImageResponse } from "@/lib/images/buffered-image-response";

export async function GET(request: NextRequest) {
  const f = request.nextUrl.searchParams.get("f");
  if (!f) return NextResponse.json({ error: "Missing filename" }, { status: 400 });

  const id = f.split(".")[0];
  const row = getDb().prepare("SELECT mime_type, data FROM swipe_files WHERE id = ?").get(id) as
    | { mime_type: string; data: Buffer }
    | undefined;
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return bufferedImageResponse(row.data, row.mime_type, "public, max-age=31536000, immutable");
}
