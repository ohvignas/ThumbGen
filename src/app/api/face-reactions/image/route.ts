import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET(request: NextRequest) {
  const f = request.nextUrl.searchParams.get("f");
  if (!f) return NextResponse.json({ error: "Missing filename" }, { status: 400 });

  const id = f.split(".")[0];
  const row = getDb().prepare("SELECT mime_type, data FROM face_reactions WHERE id = ?").get(id) as
    | { mime_type: string; data: Buffer }
    | undefined;
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return new NextResponse(new Uint8Array(row.data), {
    headers: {
      "Content-Type": row.mime_type,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
