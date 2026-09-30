/** Edge-safe setup-token helpers (no Node fs). */

export const SETUP_TOKEN_QUERY = "t";
export const MIN_SETUP_PASSWORD_LENGTH = 8;

/** Edge-safe: compare SHA-256(token) to a stored hex hash. */
export async function setupTokenMatchesHash(rawToken: string, expectedHash: string): Promise<boolean> {
  if (!rawToken || !expectedHash || expectedHash.length !== 64) return false;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rawToken));
  const got = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const expect = expectedHash.toLowerCase();
  if (got.length !== expect.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ expect.charCodeAt(i);
  return diff === 0;
}
