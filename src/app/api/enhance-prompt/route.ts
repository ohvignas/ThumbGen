import { NextRequest, NextResponse } from "next/server";
import { getSetting } from "@/lib/settings";
import { buildEnhanceRubric } from "@/lib/prompt-engineering";

const MODEL = "gemini-3-flash-preview";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

export async function POST(request: NextRequest) {
  try {
    const GEMINI_API_KEY = getSetting("geminiApiKey");
    if (!GEMINI_API_KEY) {
      return NextResponse.json({ error: "GEMINI_API_KEY not configured" }, { status: 500 });
    }

    const language = getSetting("language") || "fr";
    const { prompt, context } = await request.json();

    if (!prompt) {
      return NextResponse.json({ error: "No prompt provided" }, { status: 400 });
    }

    let userMessage = `Description de la miniature :\n${prompt}`;

    if (context) {
      userMessage += "\n\n--- CONTEXTE DU WORKFLOW ---";
      if (context.faces > 0) {
        userMessage += `\n- ${context.faces} face reference connectée (le modèle gère la ressemblance automatiquement, PAS besoin de le dire dans le prompt)`;
      }
      if (context.logos && context.logos.length > 0) {
        userMessage += `\n- Logos à placer : ${context.logos.join(", ")}`;
      }
      if (context.references > 0) {
        userMessage += `\n- ${context.references} image(s) de référence pour le style`;
      }
      if (context.hasSketch) {
        userMessage += "\n- Sketch de composition connecté (placement des éléments géré par l'image, PAS besoin de le décrire)";
      }
      if (context.previousPrompts && context.previousPrompts.length > 0) {
        userMessage += "\n\n--- ITÉRATION : prompt précédent ---";
        for (const pp of context.previousPrompts) {
          userMessage += `\n"${pp}"`;
        }
        userMessage += "\n\nAméliore ce prompt en gardant les bons éléments + les modifications demandées.";
      }
    }

    const res = await fetch(`${ENDPOINT}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: buildEnhanceRubric(language) }] },
        contents: [{ role: "user", parts: [{ text: userMessage }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      console.error("Enhance prompt error:", err);
      return NextResponse.json({ error: "API error" }, { status: 500 });
    }

    const data = await res.json();
    const enhanced = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

    return NextResponse.json({ enhanced: enhanced.trim() });
  } catch (err) {
    console.error("Enhance prompt error:", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
