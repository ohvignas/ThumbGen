import { NextResponse } from "next/server";
import { defaultLogoProviders, searchLogos } from "@/lib/logos/search";
import { LOGO_SEARCH_MIN_CHARS } from "@/lib/logos/shared";
import { getTypedSettings } from "@/lib/settings";

export const runtime = "nodejs";

const MAX_QUERY_LENGTH = 100;

export async function GET(request: Request) {
  const query = (new URL(request.url).searchParams.get("q") ?? "").trim();
  if (query.length < LOGO_SEARCH_MIN_CHARS) {
    return NextResponse.json({ error: `Au moins ${LOGO_SEARCH_MIN_CHARS} caractères` }, { status: 400 });
  }
  if (query.length > MAX_QUERY_LENGTH) {
    return NextResponse.json({ error: "Recherche trop longue" }, { status: 400 });
  }
  const providers = defaultLogoProviders(getTypedSettings().brandfetchApiKey);
  return NextResponse.json(await searchLogos(query, { providers }));
}
