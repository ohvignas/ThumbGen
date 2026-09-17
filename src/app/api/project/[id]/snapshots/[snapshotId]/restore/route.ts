import { NextRequest, NextResponse } from "next/server";
import { restoreCanvasSnapshot } from "@/lib/canvas-snapshots";
import { rejectNonJsonRequest } from "@/lib/youtube/route-errors";

export const runtime = "nodejs";

/**
 * Puts a snapshot back on the canvas. The current state is snapshotted first,
 * so a restore can itself be undone. JSON-only, like the other routes that
 * overwrite data, so another site open in the browser cannot trigger it.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; snapshotId: string }> },
) {
  const rejected = rejectNonJsonRequest(request);
  if (rejected) return rejected;
  const { id, snapshotId } = await params;
  const result = restoreCanvasSnapshot(id, snapshotId);
  if (!result) return NextResponse.json({ error: "Instantané introuvable" }, { status: 404 });
  return NextResponse.json({ success: true, updated_at: result.updated_at });
}
