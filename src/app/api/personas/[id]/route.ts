import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { label } = (await request.json()) as { label?: string };
    if (!label || !label.trim()) return NextResponse.json({ error: "Missing label" }, { status: 400 });
    const result = getDb().prepare("UPDATE personas SET label = ? WHERE id = ?").run(label.trim(), id);
    if (result.changes === 0) return NextResponse.json({ error: "Persona not found" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Rename persona error:", err);
    return NextResponse.json({ error: "Rename failed" }, { status: 500 });
  }
}

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
