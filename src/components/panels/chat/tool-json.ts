/** Tokens without spaces (base64 images, ids) and data: URLs longer than this are shortened in the step detail. */
const MAX_TOKEN_LENGTH = 160;
/** Readable text (with spaces) longer than this is shortened. */
const MAX_TEXT_LENGTH = 600;
/** The whole detail block stops after this many characters. */
const MAX_TOTAL_LENGTH = 4000;

function shortenString(value: string): string {
  const tokenLike = value.startsWith("data:") || !/\s/.test(value);
  if (tokenLike) {
    return value.length > MAX_TOKEN_LENGTH ? `${value.slice(0, 40)}… (${value.length} caractères)` : value;
  }
  return value.length > MAX_TEXT_LENGTH ? `${value.slice(0, MAX_TEXT_LENGTH)}… (${value.length} caractères)` : value;
}

/** Pretty JSON of a tool input or output for the step detail; « — » when there is nothing. */
export function formatToolJson(value: unknown): string {
  if (value === undefined) return "—";
  let json: string | undefined;
  try {
    json = JSON.stringify(value, (_key, v: unknown) => (typeof v === "string" ? shortenString(v) : v), 2);
  } catch {
    return String(value);
  }
  if (json === undefined) return "—";
  return json.length > MAX_TOTAL_LENGTH ? `${json.slice(0, MAX_TOTAL_LENGTH)}\n…` : json;
}
