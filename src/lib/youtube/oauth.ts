import { getTypedSettings } from "@/lib/settings";

export const YOUTUBE_OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
] as const;

export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

export function youtubeOauthRedirectUri(origin: string): string {
  return `${origin.replace(/\/$/, "")}/api/youtube/oauth/callback`;
}

export function requestOrigin(request: Request): string {
  const url = new URL(request.url);
  const forwarded = request.headers.get("x-forwarded-host");
  const proto = request.headers.get("x-forwarded-proto");
  if (forwarded) return `${proto || url.protocol.replace(":", "")}://${forwarded.split(",")[0]!.trim()}`;
  return url.origin;
}

export function newOauthState(): string {
  return crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
}

export function buildGoogleAuthUrl(input: { clientId: string; redirectUri: string; state: string }): string {
  const params = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: "code",
    scope: YOUTUBE_OAUTH_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state: input.state,
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export type GoogleTokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
};

export async function exchangeGoogleCode(input: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): Promise<GoogleTokenResponse> {
  return postGoogleToken({
    grant_type: "authorization_code",
    code: input.code,
    client_id: input.clientId,
    client_secret: input.clientSecret,
    redirect_uri: input.redirectUri,
  });
}

export async function refreshGoogleAccessToken(input: {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}): Promise<GoogleTokenResponse> {
  return postGoogleToken({
    grant_type: "refresh_token",
    refresh_token: input.refreshToken,
    client_id: input.clientId,
    client_secret: input.clientSecret,
  });
}

async function postGoogleToken(body: Record<string, string>): Promise<GoogleTokenResponse> {
  let res: Response;
  try {
    res = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(body),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new Error("Google injoignable");
  }
  const json = (await res.json().catch(() => ({}))) as {
    access_token?: unknown;
    expires_in?: unknown;
    refresh_token?: unknown;
    scope?: unknown;
    error?: unknown;
    error_description?: unknown;
  };
  if (!res.ok || typeof json.access_token !== "string") {
    const detail =
      (typeof json.error_description === "string" && json.error_description) ||
      (typeof json.error === "string" && json.error) ||
      `HTTP ${res.status}`;
    throw new Error(`Échange de jeton Google refusé (${detail})`);
  }
  return {
    access_token: json.access_token,
    expires_in: typeof json.expires_in === "number" ? json.expires_in : 3600,
    refresh_token: typeof json.refresh_token === "string" ? json.refresh_token : undefined,
    scope: typeof json.scope === "string" ? json.scope : undefined,
  };
}

export function isGoogleOauthClientId(value: string): boolean {
  return /^[\w.-]+\.apps\.googleusercontent\.com$/.test(value.trim());
}

export function oauthClientConfigured(): boolean {
  return oauthClientCredentials() !== null;
}

export function oauthClientCredentials(): { clientId: string; clientSecret: string } | null {
  const { googleOAuthClientId, googleOAuthClientSecret } = getTypedSettings();
  const clientId = googleOAuthClientId.trim();
  const clientSecret = googleOAuthClientSecret?.trim() ?? "";
  if (!isGoogleOauthClientId(clientId) || !clientSecret) return null;
  return { clientId, clientSecret };
}
