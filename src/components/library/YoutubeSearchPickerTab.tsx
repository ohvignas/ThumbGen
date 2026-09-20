"use client";

import { useState } from "react";
import type { LibraryPick } from "@/components/library/picker-tabs";
import YoutubeSearchResults from "./YoutubeSearchResults";
import { DEFAULT_YOUTUBE_SEARCH_REGION, type YoutubeSearchRegion } from "@/lib/youtube/search-regions";
import type { YoutubeSearchHit } from "@/lib/youtube/types";

export default function YoutubeSearchPickerTab({
  query,
  onPick,
  region = DEFAULT_YOUTUBE_SEARCH_REGION,
}: {
  query: string;
  onPick: (item: LibraryPick) => void;
  region?: YoutubeSearchRegion;
}) {
  const [usingId, setUsingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const useHit = async (hit: YoutubeSearchHit) => {
    setUsingId(hit.videoId);
    setError(null);
    try {
      const res = await fetch("/api/youtube/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId: hit.videoId, title: hit.title }),
      });
      const body = (await res.json().catch(() => null)) as { imageUrl?: string; label?: string; error?: string } | null;
      if (!res.ok || !body?.imageUrl) throw new Error(body?.error || `HTTP ${res.status}`);
      onPick({ imageUrl: body.imageUrl, label: body.label || hit.title });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Copie impossible");
    } finally {
      setUsingId(null);
    }
  };

  return (
    <div className="grid gap-2">
      {error && <p className="text-sm text-destructive">{error}</p>}
      <YoutubeSearchResults query={query} region={region} onUse={useHit} usingId={usingId} />
    </div>
  );
}
