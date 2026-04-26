import Anthropic from "@anthropic-ai/sdk";
import { getSetting } from "@/lib/settings";
import { updateConversationTitle } from "./store";

const TITLE_MODEL = "claude-haiku-4-5-20251001";

const SYSTEM = `Tu génères des titres TRÈS courts pour une conversation de design de miniatures YouTube.

Règles strictes :
- 3 à 6 mots maximum
- En français
- Pas de guillemets, pas de points, pas de markdown
- Capture le sujet ou l'intention de la première demande, pas le ton
- Si le message mentionne un produit/marque, garde-le

Réponds UNIQUEMENT avec le titre brut, rien d'autre.`;

/**
 * Generate a short title for a conversation from the user's first message.
 * Fire-and-forget: failures are logged but don't block the agent loop. The
 * SSE `send` callback is invoked on success so the chat UI can refresh the
 * conversation list immediately.
 */
export async function generateAndPersistTitle(
  conversationId: string,
  firstUserText: string,
  send: (event: string, data: unknown) => void,
): Promise<void> {
  const apiKey = getSetting("anthropicApiKey") || process.env.ANTHROPIC_API_KEY;
  if (!apiKey || !firstUserText.trim()) return;

  try {
    const anthropic = new Anthropic({ apiKey });
    const res = await anthropic.messages.create({
      model: TITLE_MODEL,
      max_tokens: 40,
      system: SYSTEM,
      messages: [{ role: "user", content: firstUserText.slice(0, 1000) }],
    });

    const block = res.content.find((b) => b.type === "text");
    if (!block || block.type !== "text") return;

    // Sanitize: trim, strip surrounding quotes / trailing punctuation, cap length
    let title = block.text.trim().replace(/^["'«»"]+|["'«»"]+$/g, "");
    title = title.replace(/[.!?…]+$/g, "").trim();
    if (!title) return;
    if (title.length > 80) title = title.slice(0, 77).trimEnd() + "…";

    updateConversationTitle(conversationId, title);
    send("conversation_renamed", { conversation_id: conversationId, title });
  } catch (e) {
    console.warn("[auto-title] generation failed:", (e as Error).message);
  }
}
