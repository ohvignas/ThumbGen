import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  // Accept both `sk_<hex>` and bare `<hex>` — the agent occasionally strips
  // the prefix when building markdown URLs, and re-asking it to be careful is
  // less reliable than letting the route be forgiving.
  const lookup = id.startsWith("sk_") ? id : `sk_${id}`;
  const row = getDb()
    .prepare("SELECT mime_type, data FROM generated_sketches WHERE id = ?")
    .get(lookup) as { mime_type: string; data: Buffer } | undefined;
  if (!row) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(row.data), {
    headers: {
      "Content-Type": row.mime_type,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
