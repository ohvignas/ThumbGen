import { NextRequest, NextResponse } from "next/server";
import { getSettings, saveSettings, AppSettings } from "@/lib/settings";

export async function GET() {
  const settings = getSettings();

  const mask = (val?: string) => {
    if (!val) return "";
    if (val.length <= 4) return "****";
    return "****" + val.slice(-4);
  };

  return NextResponse.json({
    geminiApiKey: mask(settings.geminiApiKey),
    ideogramApiKey: mask(settings.ideogramApiKey),
    openaiApiKey: mask(settings.openaiApiKey),
    grokApiKey: mask(settings.grokApiKey),
    anthropicApiKey: mask(settings.anthropicApiKey),
    youtubeApiKey: mask(settings.youtubeApiKey),
    youtubePlaylistId: settings.youtubePlaylistId || "",
    hasGemini: !!(settings.geminiApiKey || process.env.GEMINI_API_KEY),
    hasIdeogram: !!(settings.ideogramApiKey || process.env.IDEOGRAM_API_KEY),
    hasOpenai: !!(settings.openaiApiKey || process.env.OPENAI_API_KEY),
    hasGrok: !!(settings.grokApiKey || process.env.GROK_API_KEY),
    hasAnthropic: !!(settings.anthropicApiKey || process.env.ANTHROPIC_API_KEY),
    hasYoutube: !!(settings.youtubeApiKey || process.env.YOUTUBE_API_KEY),
    language: settings.language || "fr",
    favoriteModel: settings.favoriteModel || "gemini-3.1-flash-image-preview",
    currentProjectId: settings.currentProjectId || "default",
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<AppSettings>;
    saveSettings(body);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Save settings error:", err);
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
  }
}
