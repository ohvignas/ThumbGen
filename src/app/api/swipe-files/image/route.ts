import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const SWIPE_DIR = path.join(process.cwd(), "data", "swipe-files");

const MIME_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

// GET /api/swipe-files/image?f=filename.png — serve an uploaded swipe file
export async function GET(request: NextRequest) {
  const filename = request.nextUrl.searchParams.get("f");
  if (!filename) {
    return NextResponse.json({ error: "Missing filename" }, { status: 400 });
  }

  const safeName = path.basename(filename);
  const filePath = path.join(SWIPE_DIR, safeName);

  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const ext = safeName.split(".").pop()?.toLowerCase() || "png";
  const contentType = MIME_TYPES[ext] || "application/octet-stream";
  const buffer = fs.readFileSync(filePath);

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
