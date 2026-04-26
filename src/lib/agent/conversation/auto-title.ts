import { getOpenRouterClient } from "@/lib/agent/llm-client";
import { updateConversationTitle } from "./store";

// A small fast model for one-shot titling. anthropic/claude-haiku-4.5 via
// OpenRouter is essentially free per call and very good at constraint-followed
// short outputs. We pin a non-thinking variant — no reasoning needed for a
// 4-word title and we don't want the latency hit.
const TITLE_MODEL = "anthropic/claude-haiku-4.5";

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
  const client = getOpenRouterClient();
  if (!client || !firstUserText.trim()) return;

  try {
    const res = await client.chat.completions.create({
      model: TITLE_MODEL,
      max_tokens: 40,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: firstUserText.slice(0, 1000) },
      ],
    });

    const raw = res.choices[0]?.message?.content;
    if (!raw || typeof raw !== "string") return;

    let title = raw.trim().replace(/^["'«»"]+|["'«»"]+$/g, "");
    title = title.replace(/[.!?…]+$/g, "").trim();
    if (!title) return;
    if (title.length > 80) title = title.slice(0, 77).trimEnd() + "…";

    updateConversationTitle(conversationId, title);
    send("conversation_renamed", { conversation_id: conversationId, title });
  } catch (e) {
    console.warn("[auto-title] generation failed:", (e as Error).message);
  }
}
