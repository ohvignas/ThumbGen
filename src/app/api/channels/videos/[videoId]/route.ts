import { NextResponse } from "next/server";
import { z } from "zod";
import * as store from "@/lib/youtube/channel-store";
import { THUMB_TYPE_IDS } from "@/lib/youtube/thumb-types";

export const runtime = "nodejs";

const Schema = z.object({ thumbType: z.enum(THUMB_TYPE_IDS) });

/** Manual type: thumb_type_source = manual, never rewritten by the AI. */
export async function PATCH(request: Request, { params }: { params: Promise<{ videoId: string }> }) {
  const { videoId } = await params;
  const parsed = Schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Type de miniature inconnu" }, { status: 400 });
  if (!store.setManualThumbType(videoId, parsed.data.thumbType)) {
    return NextResponse.json({ error: "Vidéo inconnue" }, { status: 404 });
  }
  return NextResponse.json({ videoId, thumbType: parsed.data.thumbType, thumbTypeSource: "manual" });
}
