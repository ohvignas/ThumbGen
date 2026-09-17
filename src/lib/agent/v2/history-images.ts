/**
 * Earlier turns' tool-result images are re-sent to the model on every turn
 * unless trimmed. For the tools whose images only serve the turn that looked
 * at them (view_canvas_images, search_youtube, import_youtube_thumbnail,
 * generate_sketch, preview_thumbnail), the model input of later
 * turns replaces each image with a short text part and keeps every text part
 * (headers, refs). Only the model input changes: stored rows and the chat
 * history are never rewritten.
 */
export const HISTORY_IMAGE_PLACEHOLDER = "[image retirée de l'historique — rappelle l'outil si besoin]";

export const HISTORY_IMAGE_TRIMMED_TOOLS: readonly string[] = [
  "view_canvas_images",
  "search_youtube",
  "import_youtube_thumbnail",
  "generate_sketch",
  "preview_thumbnail",
];

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null;
}

/** A copy of `messages` whose trimmed tools' tool-result outputs hold no image or file part; untouched messages are returned as is. */
export function trimToolResultImages(messages: unknown[]): unknown[] {
  return messages.map((message) => {
    if (!isObject(message) || message.role !== "tool" || !Array.isArray(message.content)) return message;
    let changed = false;
    const content = message.content.map((part) => {
      if (!isObject(part) || part.type !== "tool-result" || !HISTORY_IMAGE_TRIMMED_TOOLS.includes(part.toolName as string)) return part;
      const output = part.output;
      if (!isObject(output) || output.type !== "content" || !Array.isArray(output.value)) return part;
      if (output.value.every((item) => isObject(item) && item.type === "text")) return part;
      changed = true;
      const value = output.value.map((item) =>
        isObject(item) && item.type === "text" ? item : { type: "text", text: HISTORY_IMAGE_PLACEHOLDER },
      );
      return { ...part, output: { ...output, value } };
    });
    return changed ? { ...message, content } : message;
  });
}

/**
 * Index of the last stored row holding an ask_user tool-result — an answered
 * question of the thumbnail journey — or -1. During a journey every answer is
 * a continuation of the same turn: images before it are no longer re-sent.
 */
export function lastResolvedAskUserRowIndex(rows: ReadonlyArray<{ content_json: string }>): number {
  for (let index = rows.length - 1; index >= 0; index--) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rows[index].content_json);
    } catch {
      continue;
    }
    if (!Array.isArray(parsed)) continue;
    const answered = parsed.some(
      (message) =>
        isObject(message) &&
        message.role === "tool" &&
        Array.isArray(message.content) &&
        message.content.some((part) => isObject(part) && part.type === "tool-result" && part.toolName === "ask_user"),
    );
    if (answered) return index;
  }
  return -1;
}
