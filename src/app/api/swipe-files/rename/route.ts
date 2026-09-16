import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

const MAX_TITLE_LENGTH = 200;

export async function POST(request: Request) {
  let body: { filename?: unknown; title?: unknown };
  try {
    body = (await request.json()) as { filename?: unknown; title?: unknown };
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
  }

  const filename = typeof body.filename === "string" ? body.filename.trim() : "";
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!filename || !title) {
    return NextResponse.json({ error: "Nom de fichier ou titre manquant" }, { status: 400 });
  }
  if (title.length > MAX_TITLE_LENGTH) {
    return NextResponse.json({ error: `Titre trop long (${MAX_TITLE_LENGTH} caractères maximum)` }, { status: 400 });
  }

  // Legacy clients sent "<id>.<ext>".
  const id = filename.split(".")[0];
  const result = getDb().prepare("UPDATE swipe_files SET title = ? WHERE id = ?").run(title, id);
  if (result.changes === 0) return NextResponse.json({ error: "Image introuvable" }, { status: 404 });
  return NextResponse.json({ success: true });
}
