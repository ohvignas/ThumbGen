import { NextResponse } from "next/server";
import { deleteOauth, getOauth } from "@/lib/youtube/oauth-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  if (!getOauth()) return NextResponse.json({ error: "Aucun compte YouTube connecté" }, { status: 404 });
  deleteOauth();
  return NextResponse.json({ ok: true });
}
