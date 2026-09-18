import { NextResponse } from "next/server";
import { readConnectionPublic } from "@/lib/youtube/connection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(readConnectionPublic());
}
