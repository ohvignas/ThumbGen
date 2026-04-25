import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const row = getDb()
    .prepare("SELECT mime_type, data FROM chat_uploads WHERE id = ?")
    .get(id) as { mime_type: string; data: Buffer } | undefined;

  if (!row) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(row.data), {
    headers: {
      "Content-Type": row.mime_type,
      "Cache-Control": "private, max-age=86400",
    },
  });
}
