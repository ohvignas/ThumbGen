import { NextResponse } from "next/server";
import {
  buildGoogleAuthUrl,
  newOauthState,
  oauthClientCredentials,
  requestOrigin,
  youtubeOauthRedirectUri,
} from "@/lib/youtube/oauth";
import { saveOauthState } from "@/lib/youtube/oauth-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const creds = oauthClientCredentials();
  if (!creds) {
    return NextResponse.redirect(new URL("/reglages/connexions?youtube=need-client", request.url));
  }
  const origin = requestOrigin(request);
  const state = newOauthState();
  saveOauthState(state, origin);
  const url = buildGoogleAuthUrl({
    clientId: creds.clientId,
    redirectUri: youtubeOauthRedirectUri(origin),
    state,
  });
  return NextResponse.redirect(url);
}
