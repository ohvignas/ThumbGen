import { generateText } from "ai";
import { getOpenRouterProvider } from "@/lib/agent/v2/openrouter-provider";
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
 * Fire-and-forget (matches v1's exact behavior — the caller does not await
 * this): failures are logged but don't block the agent turn. There's no more
 * SSE `conversation_renamed` event under v2 — the caller triggers a
 * conversation-list refresh on its own timeline (ChatPanel.tsx bumps
 * conversationListVersion after every send, independent of this) and picks
 * up whatever title is in the DB by then; the eventual-consistency gap this
 * creates (title may lag by one refresh if this hasn't written yet) already
 * existed in v1, since the SSE event there was equally unawaited/racy against
 * the main turn's own completion.
 */
export async function generateAndPersistTitle(
  conversationId: string,
  firstUserText: string,
): Promise<void> {
  const provider = getOpenRouterProvider();
  if (!provider || !firstUserText.trim()) return;

  try {
    const { text } = await generateText({
      model: provider(TITLE_MODEL),
      system: SYSTEM,
      messages: [{ role: "user", content: firstUserText.slice(0, 1000) }],
      maxOutputTokens: 40,
    });

    let title = text.trim().replace(/^["'«»"]+|["'«»"]+$/g, "");
    title = title.replace(/[.!?…]+$/g, "").trim();
    if (!title) return;
    if (title.length > 80) title = title.slice(0, 77).trimEnd() + "…";

    updateConversationTitle(conversationId, title);
  } catch (e) {
    console.warn("[auto-title] generation failed:", (e as Error).message);
  }
}
