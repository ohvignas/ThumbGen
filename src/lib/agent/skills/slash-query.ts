import { lookupSlashToken, SLASH_SKILLS, type SlashSkill } from "./slash-catalog";

const QUERY_AT_CURSOR = /(?:^|\s)\/([a-z0-9_-]*)$/i;
const TOKEN_IN_TEXT = /(^|\s)\/([a-z0-9][a-z0-9_-]{0,80})(?=\s|$)/gi;

export type SlashQuery = { start: number; query: string };

/** Open `/` token ending at the cursor (start of input or after whitespace). */
export function slashQueryAtCursor(text: string, cursor: number): SlashQuery | null {
  if (cursor < 0 || cursor > text.length) return null;
  const before = text.slice(0, cursor);
  const match = before.match(QUERY_AT_CURSOR);
  if (!match) return null;
  const query = match[1] ?? "";
  const start = before.length - query.length - 1;
  if (start < 0 || text[start] !== "/") return null;
  return { start, query };
}

/**
 * Composer trigger: honor the live cursor, but if it is stale (still 0 after
 * inserting `/`), still open when the command token is at the end of the draft.
 */
export function composerSlashQuery(text: string, cursor: number): SlashQuery | null {
  const atCursor = slashQueryAtCursor(text, cursor);
  if (atCursor) return atCursor;
  if (cursor === 0 || cursor > text.length) {
    return slashQueryAtCursor(text, text.length);
  }
  return null;
}

export function filterSlashSkills(query: string): SlashSkill[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...SLASH_SKILLS];
  return SLASH_SKILLS.filter((row) => {
    return (
      row.slash.includes(needle) ||
      row.skill.toLowerCase().includes(needle) ||
      row.title.toLowerCase().includes(needle) ||
      row.description.toLowerCase().includes(needle) ||
      row.aliases?.some((alias) => alias.includes(needle))
    );
  });
}

export function applySlashPick(text: string, cursor: number, alias: string): { text: string; cursor: number } {
  const insertion = `/${alias} `;
  const open = composerSlashQuery(text, cursor);
  if (!open) {
    const next = `${text.slice(0, cursor)}${insertion}${text.slice(cursor)}`;
    return { text: next, cursor: cursor + insertion.length };
  }
  const tokenEnd = open.start + 1 + open.query.length;
  const next = `${text.slice(0, open.start)}${insertion}${text.slice(tokenEnd)}`;
  return { text: next, cursor: open.start + insertion.length };
}

/** First known picker slash in the user message (send / retry source of truth). */
export function parseInvokedSkillFromText(text: string): SlashSkill | null {
  TOKEN_IN_TEXT.lastIndex = 0;
  for (const match of text.matchAll(TOKEN_IN_TEXT)) {
    const entry = lookupSlashToken(match[2] ?? "");
    if (entry) return entry;
  }
  return null;
}

/** User text with the first known slash token removed. Empty for a bare `/croquis`. */
export function slashRemainderAfterInvoke(text: string): string {
  TOKEN_IN_TEXT.lastIndex = 0;
  for (const match of text.matchAll(TOKEN_IN_TEXT)) {
    const entry = lookupSlashToken(match[2] ?? "");
    if (!entry) continue;
    const start = match.index ?? 0;
    return `${text.slice(0, start)}${text.slice(start + match[0].length)}`.replace(/\s+/g, " ").trim();
  }
  return text.trim();
}
