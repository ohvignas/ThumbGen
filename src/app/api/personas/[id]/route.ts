import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const persona = getDb().prepare("SELECT id FROM personas WHERE id = ?").get(id);
    if (!persona) return NextResponse.json({ error: "Persona not found" }, { status: 404 });
    getDb().prepare("DELETE FROM personas WHERE id = ?").run(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Delete persona error:", err);
    return NextResponse.json({ error: "Failed to delete persona" }, { status: 500 });
  }
}
