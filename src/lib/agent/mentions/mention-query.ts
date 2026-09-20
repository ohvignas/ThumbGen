import type { MentionableImage } from "@/lib/canvas/mentionable-images";

const QUERY_AT_CURSOR = /(?:^|\s)@([#a-z0-9_-]*)$/i;

export type MentionQuery = { start: number; query: string };

/** Open `@` token ending at the cursor (start of input or after whitespace). */
export function mentionQueryAtCursor(text: string, cursor: number): MentionQuery | null {
  if (cursor < 0 || cursor > text.length) return null;
  const before = text.slice(0, cursor);
  const match = before.match(QUERY_AT_CURSOR);
  if (!match) return null;
  const query = match[1] ?? "";
  const start = before.length - query.length - 1;
  if (start < 0 || text[start] !== "@") return null;
  return { start, query };
}

/** Same stale-cursor fallback as `/` (selectionStart still 0 after inserting `@`). */
export function composerMentionQuery(text: string, cursor: number): MentionQuery | null {
  const atCursor = mentionQueryAtCursor(text, cursor);
  if (atCursor) return atCursor;
  if (cursor === 0 || cursor > text.length) {
    return mentionQueryAtCursor(text, text.length);
  }
  return null;
}

export function filterMentionableImages(items: readonly MentionableImage[], query: string): MentionableImage[] {
  const needle = query.replace(/^#/, "").trim().toLowerCase();
  if (!needle) return [...items];
  return items.filter((row) => {
    return (
      row.visibleId.toLowerCase().includes(needle) ||
      row.visibleId.replace(/^#/, "").toLowerCase().includes(needle) ||
      row.label.toLowerCase().includes(needle) ||
      row.image.toLowerCase().includes(needle)
    );
  });
}

export function mentionInsertion(visibleId: string): string {
  const id = visibleId.startsWith("#") ? visibleId : `#${visibleId}`;
  return `@${id} `;
}

export function applyMentionPick(text: string, cursor: number, visibleId: string): { text: string; cursor: number } {
  const insertion = mentionInsertion(visibleId);
  const open = composerMentionQuery(text, cursor);
  if (!open) {
    const next = `${text.slice(0, cursor)}${insertion}${text.slice(cursor)}`;
    return { text: next, cursor: cursor + insertion.length };
  }
  const tokenEnd = open.start + 1 + open.query.length;
  const next = `${text.slice(0, open.start)}${insertion}${text.slice(tokenEnd)}`;
  return { text: next, cursor: open.start + insertion.length };
}
