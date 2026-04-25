import { NextRequest, NextResponse } from "next/server";
import { getSetting } from "@/lib/settings";
import { buildSuggestRubric } from "@/lib/prompt-engineering";

const MODEL = "gemini-3-flash-preview";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

export async function POST(request: NextRequest) {
  try {
    const GEMINI_API_KEY = getSetting("geminiApiKey");
    if (!GEMINI_API_KEY) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY not configured. Add it in Settings." },
        { status: 500 }
      );
    }

    const language = getSetting("language") || "fr";
    const { script, context } = await request.json();

    if (!script) {
      return NextResponse.json(
        { error: "Donne au moins une description de ta vidéo" },
        { status: 400 }
      );
    }

    let userMessage = `Vidéo / sujet : ${script}\n`;

    if (context) {
      userMessage += "\n--- ÉLÉMENTS DISPONIBLES DANS LE WORKFLOW ---";
      if (context.faces > 0) userMessage += `\n- ${context.faces} photo(s) de visage disponible(s)`;
      if (context.logos && context.logos.length > 0) userMessage += `\n- Logos disponibles : ${context.logos.join(", ")}`;
      if (context.references > 0) userMessage += `\n- ${context.references} image(s) de référence disponible(s)`;
      if (context.hasSketch) userMessage += "\n- Un sketch de composition est disponible";
      userMessage += "\n\nIntègre ces éléments dans tes propositions de miniatures.";
    }

    const res = await fetch(`${ENDPOINT}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: buildSuggestRubric(language) }] },
        contents: [{ role: "user", parts: [{ text: userMessage }] }],
        generationConfig: {
          temperature: 1.0,
          maxOutputTokens: 8192,
        },
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      console.error("Gemini suggest error:", err);
      return NextResponse.json({ error: "Gemini API error" }, { status: 500 });
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

    const jsonStr = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const suggestions = JSON.parse(jsonStr);

    return NextResponse.json({ suggestions });
  } catch (err) {
    console.error("Suggest prompts error:", err);
    return NextResponse.json({ error: "Failed to generate suggestions" }, { status: 500 });
  }
}
