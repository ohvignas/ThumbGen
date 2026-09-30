/** Shared SITE_PASSWORD gate helpers (Edge + Node). */

export const AUTH_COOKIE_NAME = "thumbgen_auth";
export const AUTH_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
const AUTH_PURPOSE = "thumbgen-site-auth-v1";

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return toHex(digest);
}

async function hmacHex(key: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(message));
  return toHex(sig);
}

/** Constant-time string compare (equal-length digests). */
export function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Cookie holds an HMAC verifier of the site password, not the secret itself. */
export async function authCookieVerifier(sitePassword: string): Promise<string> {
  return hmacHex(sitePassword, AUTH_PURPOSE);
}

export async function isValidAuthCookie(
  cookieValue: string | undefined,
  sitePassword: string,
): Promise<boolean> {
  if (!cookieValue) return false;
  const expected = await authCookieVerifier(sitePassword);
  return timingSafeEqualStr(cookieValue, expected);
}

/** Timing-safe password check via equal-length SHA-256 digests. */
export async function passwordMatches(candidate: string, sitePassword: string): Promise<boolean> {
  const [a, b] = await Promise.all([sha256Hex(candidate), sha256Hex(sitePassword)]);
  return timingSafeEqualStr(a, b);
}

/** Secure cookies only on HTTPS so local http://127.0.0.1 still works. */
export function shouldSecureCookie(request: {
  headers: Headers;
  nextUrl: { protocol: string };
}): boolean {
  const forwarded = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  if (forwarded === "https") return true;
  if (forwarded === "http") return false;
  return request.nextUrl.protocol === "https:";
}

export function authCookieOptions(secure: boolean) {
  return {
    httpOnly: true as const,
    secure,
    sameSite: "lax" as const,
    maxAge: AUTH_COOKIE_MAX_AGE,
    path: "/",
  };
}
