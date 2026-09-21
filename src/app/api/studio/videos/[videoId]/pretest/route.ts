import { NextResponse } from "next/server";
import { pretestTitleVariants } from "@/lib/studio/title-pretest";

export const runtime = "nodejs";

type VideoParams = { params: Promise<{ videoId: string }> };

export async function POST(_request: Request, { params }: VideoParams) {
  const { videoId } = await params;
  try {
    return NextResponse.json({ rows: await pretestTitleVariants(videoId) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inattendue";
    const status = message === "Fiche vidéo introuvable." ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
