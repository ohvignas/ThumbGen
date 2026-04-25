import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const { filename, label } = await request.json();
    if (!filename || !label) return NextResponse.json({ error: "Missing filename or label" }, { status: 400 });

    const id = filename.split(".")[0];
    const result = getDb().prepare("UPDATE logos SET label = ? WHERE id = ?").run(label, id);
    if (result.changes === 0) return NextResponse.json({ error: "Logo not found" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Rename logo error:", err);
    return NextResponse.json({ error: "Rename failed" }, { status: 500 });
  }
}
