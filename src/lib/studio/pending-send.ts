export function consumePendingSend(pending: string | null): { draft: string } | null {
  const text = pending?.trim();
  if (!text) return null;
  return { draft: text.endsWith(" ") ? text : `${text} ` };
}
