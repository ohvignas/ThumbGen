import { NextRequest, NextResponse } from "next/server";
import { getSetting } from "@/lib/settings";

const MODEL = "gemini-3-flash-preview";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

function buildSystemPrompt(language: string) {
  const langNames: Record<string, string> = {
    fr: "français", en: "English", es: "español",
    de: "Deutsch", pt: "português", it: "italiano",
  };
  const langName = langNames[language] || language;

  return `Tu es un ingénieur prompt spécialisé en génération d'images IA. Tu corriges et structures les prompts pour qu'ils soient précis, sans contradiction, et optimaux pour les modèles de diffusion (Gemini, GPT Image, Midjourney).

## TON TRAVAIL
L'utilisateur te donne une description brute. Tu la transformes en prompt structuré, COHÉRENT et SANS AMBIGUÏTÉ.

## RÈGLES ANTI-CONFUSION — OBLIGATOIRE

### 1. Zéro contradiction logique
- Vérifie que la POSE est physiquement possible
- Vérifie que les TAILLES RELATIVES sont cohérentes (un logo sur une pointe de flèche de 2cm ≠ "large logo")
- Vérifie que le CADRAGE est compatible avec les éléments (medium shot = torse→tête, pas de place pour un objet géant à côté)
- Si sujet à gauche + objet à droite → utilise wide shot ou full body, PAS medium shot

### 2. Termes visuels EXACTS uniquement
- INTERDIT : "extreme medium shot" (n'existe pas), "high-quality" (vague), "professionally integrated" (rien pour une IA)
- INTERDIT : "optimized for CTR", "maximum click-through" (concepts marketing, zéro signal visuel)
- INTERDIT : empiler plus de 2-3 qualificatifs de qualité
- Cadrages valides : extreme close-up, close-up, medium close-up, medium shot, medium full shot, full shot, wide shot

### 3. Pas de bruit
- Les MAJUSCULES et "MUST" n'ont AUCUN effet sur les modèles de diffusion. Ne les utilise PAS.
- La cohérence du visage est gérée par le face reference, pas par le texte du prompt
- Maximum 2 descripteurs de style (ex: "photorealistic, cinematic" — pas 8 mots)
- Chaque mot du prompt doit apporter une info visuelle nouvelle

### 4. Depth of field cohérent
- Shallow DoF = UN SEUL plan net. Si 2 objets doivent être nets, ils doivent être au même plan focal
- Si sujet + objet lointain doivent être nets → utilise "deep focus" pas "shallow depth of field"

## STRUCTURE OBLIGATOIRE
Réponds avec exactement ces sections, chacune en UNE phrase :

SUBJECT: [Qui. Pose précise et physiquement réaliste. Expression faciale.]
COMPOSITION: [Cadrage exact (un seul terme valide). Position du sujet dans le frame.]
OBJECTS: [Chaque objet avec sa taille relative au frame et sa position exacte. Ex: "Figma logo (15% frame) top-right corner"]
TEXT: [Si demandé. Texte en ${langName}, MAJUSCULES, 2-3 mots, couleur + position + "bold, black outline". Sinon omets.]
LIGHTING: [UN seul type. Ex: "dramatic side lighting" ou "soft studio light". Pas de liste.]
STYLE: [2 mots max. Ex: "photorealistic, cinematic"]

## FORMAT DE SORTIE
Chaque ligne = une section. Pas de labels "SUBJECT:" dans la sortie. Juste les 5-6 phrases, une par ligne, dans l'ordre.
Si une section n'est pas pertinente (pas de texte overlay, pas de logos), OMETS la ligne.`;
}

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
        system_instruction: { parts: [{ text: buildSystemPrompt(language) }] },
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
