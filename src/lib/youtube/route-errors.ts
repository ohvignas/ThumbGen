import { NextResponse } from "next/server";
import { YouTubeApiError } from "./api";
import { MISSING_YOUTUBE_KEY_ERROR } from "./types";

/**
 * Routes that spend YouTube quota or OpenRouter credit only accept a body declared as JSON. A cross-site
 * HTML form or no-cors fetch cannot set that Content-Type without a CORS preflight, which these routes never
 * allow, so another site open in the browser cannot trigger them. null when the request may go on.
 */
export function rejectNonJsonRequest(request: Request): NextResponse | null {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.trim().toLowerCase().startsWith("application/json")) return null;
  return NextResponse.json({ error: "Requête JSON attendue" }, { status: 415 });
}

export function missingYouTubeKeyResponse(): NextResponse {
  return NextResponse.json({ error: MISSING_YOUTUBE_KEY_ERROR }, { status: 400 });
}

/** YouTube failures as short French messages; never includes the API key. */
export function youtubeErrorResponse(err: unknown): NextResponse {
  if (err instanceof YouTubeApiError) {
    if (err.isQuota) return NextResponse.json({ error: "Quota YouTube atteint — réessaie demain" }, { status: 429 });
    if (err.status === 0) return NextResponse.json({ error: "YouTube injoignable, réessaie" }, { status: 502 });
    if (err.status === 400 || err.status === 403) {
      return NextResponse.json({ error: "YouTube a refusé la clé — vérifie-la dans Réglages → Connexions" }, { status: 502 });
    }
    return NextResponse.json({ error: "YouTube ne répond pas correctement, réessaie" }, { status: 502 });
  }
  console.error("[channels] unexpected error", err);
  return NextResponse.json({ error: "Erreur inattendue" }, { status: 500 });
}
