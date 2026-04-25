import { NextResponse } from "next/server";
import { ensureMcpApiKey, regenerateMcpApiKey } from "@/lib/settings";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ key: ensureMcpApiKey() });
}

export async function POST() {
  return NextResponse.json({ key: regenerateMcpApiKey() });
}
