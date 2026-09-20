import { NextResponse } from "next/server";
import type { WorkingSubjectResponse } from "@/lib/youtube/types";
import { workingSubject } from "@/lib/youtube/video-queries";

export const runtime = "nodejs";

/** Hero is always the last 7 days. Period query is ignored. */
export async function GET() {
  const body: WorkingSubjectResponse = await workingSubject();
  return NextResponse.json(body);
}
