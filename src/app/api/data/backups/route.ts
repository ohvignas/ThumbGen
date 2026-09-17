import { NextResponse } from "next/server";
import { BackupInProgressError, createBackup, deleteBackup, listBackups } from "@/lib/data-admin";

export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json(listBackups());
  } catch (err) {
    console.error("List backups error:", err);
    return NextResponse.json({ error: "Liste des sauvegardes impossible" }, { status: 500 });
  }
}

export async function POST() {
  try {
    return NextResponse.json(await createBackup(), { status: 201 });
  } catch (err) {
    if (err instanceof BackupInProgressError) {
      return NextResponse.json({ error: "Une sauvegarde est déjà en cours" }, { status: 409 });
    }
    console.error("Create backup error:", err);
    return NextResponse.json({ error: "Échec de la sauvegarde" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const name = new URL(request.url).searchParams.get("name") ?? "";
  try {
    if (!deleteBackup(name)) return NextResponse.json({ error: "Sauvegarde inconnue" }, { status: 400 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Delete backup error:", err);
    return NextResponse.json({ error: "Suppression impossible" }, { status: 500 });
  }
}
