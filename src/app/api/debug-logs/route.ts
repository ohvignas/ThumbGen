import { NextRequest, NextResponse } from "next/server";
import { readDebugLogs } from "@/lib/debug-log";

/** Server-side ring buffer (agent tools, canvas save, generate). Client logs live in the browser. */
export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get("projectId") || undefined;
  return NextResponse.json({ entries: readDebugLogs(projectId) });
}
