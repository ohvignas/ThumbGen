import { NextRequest, NextResponse } from "next/server";
import { resolvePending } from "@/lib/agent/pending-actions";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as
    | { tool_use_id?: string; result?: unknown }
    | null;
  if (!body?.tool_use_id) {
    return NextResponse.json({ error: "tool_use_id required" }, { status: 400 });
  }
  const ok = resolvePending(body.tool_use_id, body.result);
  return NextResponse.json({ accepted: ok });
}
