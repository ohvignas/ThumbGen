"use client";

import { useEffect, useState } from "react";
import { YOUTUBE_SEARCH_MIN_CHARS } from "@/lib/youtube/swipe-rank";
import type { YoutubeSearchResponse } from "@/lib/youtube/types";

export const YOUTUBE_SEARCH_DEBOUNCE_MS = 400;

export type YoutubeSearchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "done"; response: YoutubeSearchResponse };

type Settled = { query: string; region: string; response: YoutubeSearchResponse | null; message: string | null };

export function useYoutubeSearch(rawQuery: string, region: string): YoutubeSearchState {
  const query = rawQuery.trim();
  const active = query.length >= YOUTUBE_SEARCH_MIN_CHARS;
  const [settled, setSettled] = useState<Settled | null>(null);

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: query, region });
        const res = await fetch(`/api/youtube/search?${params}`, { signal: controller.signal });
        const body = (await res.json().catch(() => null)) as (YoutubeSearchResponse & { error?: string }) | null;
        if (!res.ok) {
          setSettled({ query, region, response: null, message: body?.error || `HTTP ${res.status}` });
          return;
        }
        if (!body || !Array.isArray(body.items)) {
          setSettled({ query, region, response: null, message: "Réponse de recherche illisible." });
          return;
        }
        setSettled({
          query,
          region,
          response: { items: body.items, jevUsed: Boolean(body.jevUsed) },
          message: null,
        });
      } catch {
        if (controller.signal.aborted) return;
        setSettled({ query, region, response: null, message: "Recherche YouTube indisponible." });
      }
    }, YOUTUBE_SEARCH_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [active, query, region]);

  if (!active) return { status: "idle" };
  if (!settled || settled.query !== query || settled.region !== region) return { status: "loading" };
  if (!settled.response) return { status: "error", message: settled.message || "Recherche YouTube indisponible." };
  return { status: "done", response: settled.response };
}
