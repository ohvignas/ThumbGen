/**
 * Prompt text the chat should keep visible after create-prompt / a prompt
 * node write. The model often only puts a 1–2 sentence summary in finish_turn
 * and a last-turn « Voir le prompt » chip — both vanish. The full text is in
 * place_node / apply_workflow input (apply_workflow's blueprint is sometimes
 * a JSON string).
 */

export type PromptCardModel = { nodeId: string; prompt: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (isRecord(value)) return value;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith("{")) return null;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function promptFromNode(node: unknown): PromptCardModel | null {
  if (!isRecord(node)) return null;
  const type = typeof node.type === "string" ? node.type : "";
  const id = typeof node.id === "string" ? node.id : "";
  if (type && type !== "prompt") return null;
  const data = isRecord(node.data) ? node.data : node;
  const prompt = typeof data.prompt === "string" ? data.prompt.trim() : "";
  if (!prompt) return null;
  if (!type && id && !/prompt/i.test(id)) return null;
  return { nodeId: id, prompt };
}

function nodesFromApplyWorkflow(input: unknown): unknown[] {
  const root = asObject(input);
  if (!root) return [];
  const blueprint = asObject(root.blueprint) ?? (Array.isArray(root.nodes) ? root : null);
  if (!blueprint || !Array.isArray(blueprint.nodes)) return [];
  return blueprint.nodes;
}

function cardsFromPlaceNode(input: unknown): PromptCardModel[] {
  const root = asObject(input);
  if (!root) return [];
  const card = promptFromNode(root.node ?? root);
  return card ? [card] : [];
}

function cardsFromApplyWorkflow(input: unknown): PromptCardModel[] {
  const cards: PromptCardModel[] = [];
  for (const node of nodesFromApplyWorkflow(input)) {
    const card = promptFromNode(node);
    if (card) cards.push(card);
  }
  return cards;
}

export function promptCardsFromTool(toolName: string, input: unknown): PromptCardModel[] {
  if (toolName === "place_node") return cardsFromPlaceNode(input);
  if (toolName === "apply_workflow") return cardsFromApplyWorkflow(input);
  return [];
}

/** Last prompt per node id, in first-seen order. */
export function mergePromptCards(cards: PromptCardModel[]): PromptCardModel[] {
  const byId = new Map<string, PromptCardModel>();
  const order: string[] = [];
  for (const card of cards) {
    const key = card.nodeId || card.prompt;
    if (!byId.has(key)) order.push(key);
    byId.set(key, card);
  }
  return order.map((key) => byId.get(key)!);
}

function canvasNodesFromTool(toolName: string, input: unknown): Array<{ type: string; id: string }> {
  if (toolName === "place_node") {
    const root = asObject(input);
    const node = root ? (isRecord(root.node) ? root.node : root) : null;
    if (!node) return [];
    return [
      {
        id: typeof node.id === "string" ? node.id : "",
        type: typeof node.type === "string" ? node.type : "",
      },
    ];
  }
  if (toolName !== "apply_workflow") return [];
  return nodesFromApplyWorkflow(input).flatMap((node) => {
    if (!isRecord(node)) return [];
    return [
      {
        id: typeof node.id === "string" ? node.id : "",
        type: typeof node.type === "string" ? node.type : "",
      },
    ];
  });
}

function isPromptNode(node: { type: string; id: string }): boolean {
  return node.type === "prompt" || (!node.type && /prompt/i.test(node.id));
}

/**
 * True when this turn's canvas writes only touch prompt nodes — then the UI
 * must not keep finish_turn generate / ask_agent chips (create-prompt).
 */
export function isPromptOnlyCanvasWrite(tools: Array<{ toolName: string; input: unknown }>): boolean {
  const nodes = tools.flatMap((tool) => canvasNodesFromTool(tool.toolName, tool.input));
  return nodes.length > 0 && nodes.every(isPromptNode);
}
