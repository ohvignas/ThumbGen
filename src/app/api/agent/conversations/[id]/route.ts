import { NextRequest, NextResponse } from "next/server";
import {
  getConversation,
  softDeleteConversation,
  updateConversationTitle,
} from "@/lib/agent/conversation/store";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { title?: string } | null;
  if (!body?.title) {
    return NextResponse.json({ error: "title required" }, { status: 400 });
  }
  if (!getConversation(id)) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }
  updateConversationTitle(id, body.title);
  return NextResponse.json(getConversation(id));
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!getConversation(id)) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }
  softDeleteConversation(id);
  return NextResponse.json({ success: true });
}
