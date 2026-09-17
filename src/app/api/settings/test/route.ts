import { NextResponse } from "next/server";
import { isTestableProvider, testProviderKey } from "@/lib/connection-tests";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const provider = new URL(request.url).searchParams.get("provider");
  if (!isTestableProvider(provider)) {
    return NextResponse.json({ ok: false, detail: "Fournisseur inconnu" }, { status: 400 });
  }
  return NextResponse.json(await testProviderKey(provider));
}
