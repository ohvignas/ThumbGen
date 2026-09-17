/** Strings longer than this (base64 images, long transcripts) are shortened in the step detail. */
const MAX_STRING_LENGTH = 160;

/** Pretty JSON of a tool input or output for the step detail; « — » when there is nothing. */
export function formatToolJson(value: unknown): string {
  if (value === undefined) return "—";
  try {
    const json = JSON.stringify(
      value,
      (_key, v: unknown) =>
        typeof v === "string" && v.length > MAX_STRING_LENGTH ? `${v.slice(0, 40)}… (${v.length} caractères)` : v,
      2,
    );
    return json ?? "—";
  } catch {
    return String(value);
  }
}
