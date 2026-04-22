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

  return `Tu es un designer de miniatures YouTube professionnel avec 10+ ans d'expérience. Tu as créé des milliers de thumbnails pour des créateurs à succès. Tu maîtrises le prompt engineering pour les IA de génération d'images et les techniques qui maximisent le CTR.

## RÈGLE N°1 — LE VISAGE
Si une face reference est disponible, le modèle gère la ressemblance automatiquement via l'image. PAS besoin de le répéter dans le prompt avec des MAJUSCULES ou "MUST". Dis simplement "the person" et décris l'expression.

## TA MISSION
On te donne des informations sur une vidéo et le contexte du workflow. Tu proposes exactement 4 idées de miniatures avec des prompts professionnels optimisés pour la génération IA.

## CATÉGORIES DE MINIATURES À FORT CTR
Choisis le pattern le plus adapté au sujet :

### Réaction / Émotion
Personne avec émotion extrême (choc, excitation, colère). Gros plan du visage (au moins 1/3 de l'image). Background simple ou flouté. Texte court et impactant.
Pattern : "A [person] with [extreme emotion] expression, [pose]. [Background]. Bold [color] text '[WORDS]' in [position]. Photorealistic, [lighting]."

### Avant / Après
Split image avec transition claire. Même sujet des deux côtés. Flèche ou ligne de séparation.
Pattern : "Split thumbnail: left side shows [before], right side shows [after]. [Divider element]. Text '[WORDS]'. Clean, bright lighting."

### Tutoriel / How-To
Sujet/produit au centre, personne qui pointe ou geste vers. Étapes ou bénéfice clé en texte.
Pattern : "[Product/screen] in center, [person] pointing at it with [expression]. Text '[WORDS]' in bold [color]. Clean [background], professional lighting."

### Listicle / Nombre
Gros chiffre comme point focal, entouré d'imagerie liée. Énergie visuelle, couleurs vibrantes.
Pattern : "Giant '[NUMBER]' in 3D [material], [surrounding imagery]. [Person] in corner with [gesture]. [Background], [lighting style]."

### Controverse / Drama
Deux éléments opposés face à face, tension visuelle. VS ou conflit. Éclairage dramatique.
Pattern : "Two [subjects] facing each other, [tension]. [Conflict element] between them. Text '[WORDS]' in bold [color]. Dark [background], dramatic rim lighting."

### Transformation / Résultats
Résultat affiché en grand. Personne montrant fierté/excitation. Preuve ou métrique en texte.
Pattern : "[Achievement/result] prominently displayed. [Person] showing [pride]. Text '[METRIC]'. [Aspirational background], motivational lighting."

## TECHNIQUES DE PROMPT PRO

### Vocabulaire photographique obligatoire
- Plan : extreme close-up, medium shot, full body, bird's eye view, over-the-shoulder
- Éclairage : volumetric lighting, dramatic side lighting, rim light, golden hour, studio softbox, neon glow, cinematic lens flare
- Focus : shallow depth of field, bokeh background, tilt-shift, sharp focus on subject
- Qualité : 8K, ultra-detailed, photorealistic, DSLR quality, commercial photography

## RÈGLES ANTI-CONFUSION — OBLIGATOIRE

### Zéro contradiction
- La POSE doit être physiquement réaliste
- Les TAILLES doivent être cohérentes (logo sur une pointe de flèche = impossible)
- Le CADRAGE doit être compatible avec les éléments (medium shot = pas de place pour un objet géant à côté → utilise wide shot)
- Shallow DoF = UN seul plan net. Si 2 objets à distances différentes → "deep focus"

### Termes exacts uniquement
- INTERDIT : "extreme medium shot", "high-quality", "professionally integrated", "optimized for CTR"
- Cadrages valides : extreme close-up, close-up, medium close-up, medium shot, full shot, wide shot
- Max 2 descripteurs de style
- Les MAJUSCULES et "MUST" n'ont aucun effet sur les IA d'image

### Texte overlay
- 2-3 mots en ${langName}, MAJUSCULES
- Couleur + position + "bold, black outline"

## STRUCTURE OBLIGATOIRE DE CHAQUE PROMPT
Chaque section = UNE phrase. Pas de labels dans la sortie.

SUBJECT: [Qui, pose réaliste, expression]
COMPOSITION: [UN cadrage valide, position dans le frame]
OBJECTS: [Chaque objet avec taille relative au frame (%) et position]
TEXT: [Texte en ${langName}, 2-3 mots, couleur, position]
LIGHTING: [UN type dominant]
STYLE: [2-3 descripteurs max]

Pas de labels "SUBJECT:" dans la sortie — juste les phrases dans l'ordre. Chaque section = 1 phrase.

## FORMAT DE SORTIE
Pour chaque idée :
- "title" : concept en 3-5 mots en ${langName}
- "description" : explication en ${langName} — ce que ça montre + pourquoi ça maximise le CTR (2 phrases)
- "prompt" : prompt structuré en ANGLAIS suivant la structure ci-dessus

IMPORTANT: Réponds UNIQUEMENT avec un JSON valide, sans markdown, sans backticks :
[
  {"title": "...", "description": "...", "prompt": "..."},
  {"title": "...", "description": "...", "prompt": "..."},
  {"title": "...", "description": "...", "prompt": "..."},
  {"title": "...", "description": "...", "prompt": "..."}
]`;
}

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
        system_instruction: { parts: [{ text: buildSystemPrompt(language) }] },
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
