import { NextRequest, NextResponse } from "next/server";
import { getSetting } from "@/lib/settings";
import { buildEnhanceRubric } from "@/lib/prompt-engineering";
import { getOpenRouterClient } from "@/lib/agent/llm-client";

// Cheap/fast text model — this is a single-shot rubric rewrite, not the main
// agent chat, so it doesn't need to match the user's chosen agentModel.
const MODEL = "google/gemini-3.8-flash";

export async function POST(request: NextRequest) {
  try {
    const client = getOpenRouterClient();
    if (!client) {
      return NextResponse.json({ error: "OPENROUTER_API_KEY not configured" }, { status: 500 });
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

    const completion = await client.chat.completions.create({
      model: MODEL,
      temperature: 0.7,
      max_tokens: 1024,
      messages: [
        { role: "system", content: buildEnhanceRubric(language) },
        { role: "user", content: userMessage },
      ],
    });

    const enhanced = completion.choices[0]?.message?.content || "";

    return NextResponse.json({ enhanced: enhanced.trim() });
  } catch (err) {
    console.error("Enhance prompt error:", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
