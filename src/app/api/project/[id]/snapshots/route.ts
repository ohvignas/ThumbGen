import { NextRequest, NextResponse } from "next/server";
import { listCanvasSnapshots, projectExists } from "@/lib/canvas-snapshots";

export const runtime = "nodejs";

/** Canvas snapshots saved before agent writes and restores, newest first. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!projectExists(id)) return NextResponse.json({ error: "Projet introuvable" }, { status: 404 });
  return NextResponse.json({ snapshots: listCanvasSnapshots(id) });
}
