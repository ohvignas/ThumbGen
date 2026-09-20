import { NextResponse } from "next/server";
import { getSetting } from "@/lib/settings";
import {
  searchPerformantThumbnails,
  youtubeSearchErrorStatus,
  YOUTUBE_SEARCH_MAX_QUERY,
  YOUTUBE_SEARCH_MIN_CHARS,
} from "@/lib/youtube/keyword-search";
import { parseYoutubeSearchRegion } from "@/lib/youtube/search-regions";
import { MISSING_YOUTUBE_KEY_ERROR } from "@/lib/youtube/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const query = (new URL(request.url).searchParams.get("q") ?? "").trim();
  if (query.length < YOUTUBE_SEARCH_MIN_CHARS) {
    return NextResponse.json({ error: `Au moins ${YOUTUBE_SEARCH_MIN_CHARS} caractères` }, { status: 400 });
  }
  if (query.length > YOUTUBE_SEARCH_MAX_QUERY) {
    return NextResponse.json({ error: "Recherche trop longue" }, { status: 400 });
  }
  const region = parseYoutubeSearchRegion(new URL(request.url).searchParams.get("region"));
  const apiKey = getSetting("youtubeApiKey");
  if (!apiKey) {
    return NextResponse.json({ error: MISSING_YOUTUBE_KEY_ERROR }, { status: 400 });
  }
  try {
    return NextResponse.json(await searchPerformantThumbnails(apiKey, query, new Date(), region));
  } catch (error) {
    const { status, message } = youtubeSearchErrorStatus(error);
    return NextResponse.json({ error: message }, { status });
  }
}
