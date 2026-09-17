import { NextResponse } from "next/server";
import { z } from "zod";
import { approveClassification, getClassificationStatus } from "@/lib/youtube/jobs";

export const runtime = "nodejs";

const Schema = z.object({ action: z.literal("approve") });

/** « Lancer le classement » after the > 200 thumbnails confirmation. */
export async function POST(request: Request) {
  const parsed = Schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Action inconnue" }, { status: 400 });
  const approved = approveClassification();
  return NextResponse.json({ approved, classification: getClassificationStatus() });
}
