import { NextRequest, NextResponse } from "next/server";
import { createConversation, listConversations } from "@/lib/agent/conversation/store";

export async function GET(req: NextRequest) {
  const projectId = new URL(req.url).searchParams.get("project_id");
  if (!projectId) {
    return NextResponse.json({ error: "project_id required" }, { status: 400 });
  }
  return NextResponse.json(listConversations(projectId));
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { project_id?: string; title?: string } | null;
  if (!body?.project_id) {
    return NextResponse.json({ error: "project_id required" }, { status: 400 });
  }
  const conv = createConversation(body.project_id, body.title);
  return NextResponse.json(conv);
}
