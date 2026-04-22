import { NextRequest, NextResponse } from "next/server";
import { getSettings, saveSettings, AppSettings } from "@/lib/settings";

// GET /api/settings — return settings with keys masked
export async function GET() {
  const settings = getSettings();

  // Mask API keys for display (show last 4 chars only)
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
    youtubeApiKey: mask(settings.youtubeApiKey),
    youtubePlaylistId: settings.youtubePlaylistId || "",
    hasGemini: !!(settings.geminiApiKey || process.env.GEMINI_API_KEY),
    hasIdeogram: !!(settings.ideogramApiKey || process.env.IDEOGRAM_API_KEY),
    hasOpenai: !!(settings.openaiApiKey || process.env.OPENAI_API_KEY),
    hasGrok: !!(settings.grokApiKey || process.env.GROK_API_KEY),
    hasYoutube: !!(settings.youtubeApiKey || process.env.YOUTUBE_API_KEY),
    language: settings.language || "fr",
    favoriteModel: settings.favoriteModel || "gemini-3.1-flash-image-preview",
  });
}

// POST /api/settings — update settings (only non-empty values are updated)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as Partial<AppSettings>;
    const current = getSettings();

    // Only update fields that are explicitly sent (non-undefined)
    const updated: AppSettings = { ...current };
    if (body.geminiApiKey !== undefined) updated.geminiApiKey = body.geminiApiKey;
    if (body.ideogramApiKey !== undefined) updated.ideogramApiKey = body.ideogramApiKey;
    if (body.openaiApiKey !== undefined) updated.openaiApiKey = body.openaiApiKey;
    if (body.grokApiKey !== undefined) updated.grokApiKey = body.grokApiKey;
    if (body.youtubeApiKey !== undefined) updated.youtubeApiKey = body.youtubeApiKey;
    if (body.youtubePlaylistId !== undefined) updated.youtubePlaylistId = body.youtubePlaylistId;
    if (body.language !== undefined) updated.language = body.language;
    if (body.favoriteModel !== undefined) updated.favoriteModel = body.favoriteModel;

    saveSettings(updated);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Save settings error:", err);
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
  }
}
