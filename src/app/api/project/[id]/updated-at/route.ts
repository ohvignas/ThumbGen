import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const row = getDb()
    .prepare("SELECT updated_at FROM projects WHERE id = ?")
    .get(id) as { updated_at: string } | undefined;
  return NextResponse.json({ updated_at: row?.updated_at ?? null });
}
