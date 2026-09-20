import { NextResponse } from "next/server";
import type { TypesSummaryResponse } from "@/lib/youtube/types";
import { typesSummary } from "@/lib/youtube/video-queries";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const scope = new URL(request.url).searchParams.get("scope")?.trim() || "all";
  const body: TypesSummaryResponse = await typesSummary(scope);
  return NextResponse.json(body);
}
