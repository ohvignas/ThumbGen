import { NextResponse } from "next/server";
import { parseVideoQuery } from "@/lib/youtube/types";
import { listVideos } from "@/lib/youtube/video-queries";

export const runtime = "nodejs";

export function GET(request: Request) {
  return NextResponse.json(listVideos(parseVideoQuery(new URL(request.url).searchParams)));
}
