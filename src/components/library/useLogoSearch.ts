"use client";

import { useEffect, useState } from "react";
import { LOGO_SEARCH_MIN_CHARS, SEARCH_UNAVAILABLE_MESSAGE, type LogoSearchResponse } from "@/lib/logos/shared";

export const LOGO_SEARCH_DEBOUNCE_MS = 300;

export type LogoSearchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "done"; response: LogoSearchResponse };

type Settled = { query: string; response: LogoSearchResponse | null };

/** GET /api/logos/search after a pause in typing; the answer is kept per query. */
export function useLogoSearch(rawQuery: string): LogoSearchState {
  const query = rawQuery.trim();
  const active = query.length >= LOGO_SEARCH_MIN_CHARS;
  const [settled, setSettled] = useState<Settled | null>(null);

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/logos/search?q=${encodeURIComponent(query)}`, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const response = (await res.json()) as LogoSearchResponse;
        setSettled({ query, response });
      } catch {
        if (controller.signal.aborted) return;
        setSettled({ query, response: null });
      }
    }, LOGO_SEARCH_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [active, query]);

  if (!active) return { status: "idle" };
  if (!settled || settled.query !== query) return { status: "loading" };
  if (!settled.response) return { status: "error", message: SEARCH_UNAVAILABLE_MESSAGE };
  return { status: "done", response: settled.response };
}
