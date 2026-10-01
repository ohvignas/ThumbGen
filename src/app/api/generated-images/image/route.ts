import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { getGeneratedImage } from "@/lib/generated-images";
import { bufferedImageResponse } from "@/lib/images/buffered-image-response";
import { wantsDisplayThumb } from "@/lib/images/display-thumb";
import { displayThumbJpeg, thumbCacheKey } from "@/lib/images/display-thumb-cache";

export const runtime = "nodejs";

const CACHE = "public, max-age=31536000, immutable";

// Backward-compat: support both ?id=<uuid> (new) and ?f=<filename> (legacy URLs in saved projects)
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  const f = request.nextUrl.searchParams.get("f");

  let imageId = id;
  if (!imageId && f) {
    // legacy: filename was "<uuid>.<ext>"
    imageId = f.split(".")[0];
  }
  if (!imageId) {
    return Response.json({ error: "Missing id" }, { status: 400 });
  }

  const wantThumb = wantsDisplayThumb(request.nextUrl.searchParams.get("w"));
  if (wantThumb) {
    const meta = getDb()
      .prepare("SELECT length(data) AS len FROM generated_images WHERE id = ?")
      .get(imageId) as { len: number } | undefined;
    const key = meta ? thumbCacheKey("gi", imageId, meta.len) : null;
    if (meta && key) {
      try {
        const jpeg = await displayThumbJpeg(key, () => {
          const row = getDb().prepare("SELECT data FROM generated_images WHERE id = ?").get(imageId) as
            | { data: Buffer }
            | undefined;
          if (!row) throw new Error("missing");
          return row.data;
        });
        return bufferedImageResponse(jpeg, "image/jpeg", CACHE);
      } catch (err) {
        console.error("[display-thumb] generated image", imageId, err instanceof Error ? err.message : "resize failed");
      }
    }
  }

  const img = getGeneratedImage(imageId);
  if (!img) return Response.json({ error: "Not found" }, { status: 404 });

  return bufferedImageResponse(img.data, img.mimeType, CACHE);
}
