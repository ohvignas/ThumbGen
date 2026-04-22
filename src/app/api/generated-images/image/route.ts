import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import { getGeneratedImagePath } from "@/lib/generated-images";

const MIME_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

export async function GET(request: NextRequest) {
  const filename = request.nextUrl.searchParams.get("f");
  if (!filename) {
    return NextResponse.json({ error: "Missing filename" }, { status: 400 });
  }

  const filePath = getGeneratedImagePath(filename);
  if (!filePath) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const ext = filename.split(".").pop()?.toLowerCase() || "png";
  const buffer = fs.readFileSync(filePath);

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": MIME_TYPES[ext] || "image/png",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
