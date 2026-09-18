import { NextResponse } from "next/server";
import { startChannelIngest } from "@/lib/youtube/ingest";
import {
  exchangeGoogleCode,
  oauthClientCredentials,
  YOUTUBE_OAUTH_SCOPES,
  youtubeOauthRedirectUri,
} from "@/lib/youtube/oauth";
import { consumeOauthState, upsertOauth } from "@/lib/youtube/oauth-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function redirectToChaine(origin: string, query: Record<string, string>) {
  const url = new URL("/reglages/chaine", origin);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state") ?? "";
  const origin = consumeOauthState(state);
  if (!origin) return redirectToChaine(url.origin, { youtube: "error", reason: "session" });
  const error = url.searchParams.get("error");
  if (error) return redirectToChaine(origin, { youtube: "error", reason: error });
  const code = url.searchParams.get("code");
  if (!code) return redirectToChaine(origin, { youtube: "error", reason: "code" });
  const creds = oauthClientCredentials();
  if (!creds) return redirectToChaine(origin, { youtube: "error", reason: "client" });
  try {
    const tokens = await exchangeGoogleCode({
      code,
      clientId: creds.clientId,
      clientSecret: creds.clientSecret,
      redirectUri: youtubeOauthRedirectUri(origin),
    });
    if (!tokens.refresh_token) {
      return redirectToChaine(origin, { youtube: "error", reason: "refresh" });
    }
    upsertOauth({
      refreshToken: tokens.refresh_token,
      accessToken: tokens.access_token,
      expiresAtMs: Date.now() + tokens.expires_in * 1000,
      scopes: tokens.scope ?? YOUTUBE_OAUTH_SCOPES.join(" "),
      connectedAt: new Date().toISOString(),
    });
    startChannelIngest();
    return redirectToChaine(origin, { youtube: "connected" });
  } catch {
    return redirectToChaine(origin, { youtube: "error", reason: "token" });
  }
}
