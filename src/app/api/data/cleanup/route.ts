import { NextResponse } from "next/server";
import { BackupInProgressError, countCleanupCandidates, runCleanup } from "@/lib/data-admin";

export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json(countCleanupCandidates());
  } catch (err) {
    console.error("Cleanup count error:", err);
    return NextResponse.json({ error: "Comptage impossible" }, { status: 500 });
  }
}

export async function POST() {
  try {
    return NextResponse.json(runCleanup());
  } catch (err) {
    if (err instanceof BackupInProgressError) {
      return NextResponse.json({ error: "Une sauvegarde est en cours, réessaie dans un instant" }, { status: 409 });
    }
    console.error("Cleanup error:", err);
    return NextResponse.json({ error: "Échec du nettoyage" }, { status: 500 });
  }
}
