import { NextRequest, NextResponse } from "next/server";
import { getGeneratedImage } from "@/lib/generated-images";

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
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const img = getGeneratedImage(imageId);
  if (!img) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return new NextResponse(new Uint8Array(img.data), {
    headers: {
      "Content-Type": img.mimeType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
