import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { bufferedImageResponse } from "@/lib/images/buffered-image-response";

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

  return bufferedImageResponse(row.data, row.mime_type, "private, max-age=86400");
}
