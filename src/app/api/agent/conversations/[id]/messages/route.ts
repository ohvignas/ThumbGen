import { NextRequest, NextResponse } from "next/server";
import { listMessages } from "@/lib/agent/conversation/store";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return NextResponse.json(listMessages(id));
}
