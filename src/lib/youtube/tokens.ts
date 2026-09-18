import { oauthClientCredentials, refreshGoogleAccessToken } from "./oauth";
import * as oauthStore from "./oauth-store";

const EXPIRY_SKEW_MS = 60_000;

export async function getValidAccessToken(): Promise<string | null> {
  const row = oauthStore.getOauth();
  if (!row?.refresh_token) return null;
  const now = Date.now();
  if (row.access_token && row.access_token_expires_at && row.access_token_expires_at - EXPIRY_SKEW_MS > now) {
    return row.access_token;
  }
  const creds = oauthClientCredentials();
  if (!creds) return null;
  const tokens = await refreshGoogleAccessToken({
    refreshToken: row.refresh_token,
    clientId: creds.clientId,
    clientSecret: creds.clientSecret,
  });
  oauthStore.updateAccessToken(tokens.access_token, now + tokens.expires_in * 1000);
  return tokens.access_token;
}
