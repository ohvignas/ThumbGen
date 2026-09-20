import { NextResponse } from "next/server";
import { composeWhyVideo } from "@/lib/youtube/why-performance";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ videoId: string }> }) {
  const { videoId } = await params;
  const body = await composeWhyVideo(videoId, new Date(), request.signal);
  if (!body) return NextResponse.json({ error: "Vidéo inconnue" }, { status: 404 });
  return NextResponse.json(body);
}
