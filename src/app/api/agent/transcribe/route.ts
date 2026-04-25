import { NextRequest, NextResponse } from "next/server";
import { transcribeAudio } from "@/lib/agent/transcribe";

export const runtime = "nodejs";

const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // 25MB OpenAI limit

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("audio");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing audio file (form field 'audio')" }, { status: 400 });
    }
    if (file.size > MAX_AUDIO_BYTES) {
      return NextResponse.json({ error: `Audio too large (max ${MAX_AUDIO_BYTES} bytes)` }, { status: 400 });
    }
    if (file.size === 0) {
      return NextResponse.json({ error: "Audio file is empty" }, { status: 400 });
    }
    const language = (form.get("language") as string | null) ?? "fr";
    const { text } = await transcribeAudio(file, language || undefined);
    return NextResponse.json({ text });
  } catch (e) {
    const msg = (e as Error).message || "Transcription failed";
    // 503 surfaces "configure your key" distinctly from a generic upstream failure.
    const status = msg.includes("not configured") ? 503 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
