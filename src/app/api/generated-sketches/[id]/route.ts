import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { bufferedImageResponse } from "@/lib/images/buffered-image-response";
import { wantsDisplayThumb } from "@/lib/images/display-thumb";
import { displayThumbJpeg, thumbCacheKey } from "@/lib/images/display-thumb-cache";

export const runtime = "nodejs";

const CACHE = "private, max-age=3600";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  // Accept both `sk_<hex>` and bare `<hex>` — the agent occasionally strips
  // the prefix when building markdown URLs, and re-asking it to be careful is
  // less reliable than letting the route be forgiving.
  const lookup = id.startsWith("sk_") ? id : `sk_${id}`;
  const db = getDb();
  const meta = db.prepare("SELECT mime_type, length(data) AS len FROM generated_sketches WHERE id = ?").get(lookup) as
    | { mime_type: string; len: number }
    | undefined;
  if (!meta) return new Response("Not found", { status: 404 });

  if (wantsDisplayThumb(req.nextUrl.searchParams.get("w"))) {
    const key = thumbCacheKey("sk", lookup, meta.len);
    if (key) {
      try {
        const jpeg = await displayThumbJpeg(key, () => {
          const row = db.prepare("SELECT data FROM generated_sketches WHERE id = ?").get(lookup) as
            | { data: Buffer }
            | undefined;
          if (!row) throw new Error("missing");
          return row.data;
        });
        return bufferedImageResponse(jpeg, "image/jpeg", CACHE);
      } catch (err) {
        console.error("[display-thumb] sketch", lookup, err instanceof Error ? err.message : "resize failed");
      }
    }
  }

  const row = db.prepare("SELECT mime_type, data FROM generated_sketches WHERE id = ?").get(lookup) as
    | { mime_type: string; data: Buffer }
    | undefined;
  if (!row) return new Response("Not found", { status: 404 });
  return bufferedImageResponse(row.data, row.mime_type, CACHE);
}
