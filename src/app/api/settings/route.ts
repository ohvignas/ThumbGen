import { NextResponse } from "next/server";
import {
  SettingsValidationError,
  clearSetting,
  getPublicSettings,
  getSecretStatus,
  updateSettings,
} from "@/lib/settings";
import { isSecretKey } from "@/lib/settings-schema";

export async function GET() {
  return NextResponse.json(getPublicSettings());
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide", issues: [] }, { status: 400 });
  }
  try {
    updateSettings(body);
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof SettingsValidationError) {
      return NextResponse.json({ error: "Réglages invalides", issues: err.issues }, { status: 400 });
    }
    console.error("Save settings error:", err);
    return NextResponse.json({ error: "Échec de l'enregistrement des réglages" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const key = new URL(request.url).searchParams.get("key") ?? "";
  if (!isSecretKey(key)) {
    return NextResponse.json({ error: "Seules les clés secrètes peuvent être effacées" }, { status: 400 });
  }
  clearSetting(key);
  // source "env" means an environment variable still provides a value the page cannot erase.
  return NextResponse.json({ key, ...getSecretStatus(key) });
}
