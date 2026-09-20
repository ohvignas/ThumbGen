"use client";

import { useState } from "react";
import LibrarySearchInput from "./LibrarySearchInput";
import UseAsReferenceDialog from "./followed-channels/UseAsReferenceDialog";
import YoutubeRegionSelect from "./YoutubeRegionSelect";
import YoutubeSearchResults from "./YoutubeSearchResults";
import { useYoutubeSearchRegion } from "./useYoutubeSearchRegion";
import type { VideoListItem, YoutubeSearchHit } from "@/lib/youtube/types";

function hitAsVideo(hit: YoutubeSearchHit): VideoListItem {
  return {
    videoId: hit.videoId,
    channelId: hit.channelId,
    channelTitle: hit.channelTitle,
    title: hit.title,
    publishedAt: hit.publishedAt,
    durationSeconds: 600,
    viewCount: hit.viewCount,
    thumbnailUrl: hit.thumbnailUrl,
    thumbType: null,
    thumbTypeSource: null,
    performance: hit.performance,
    description: "",
  };
}

export default function YoutubeSearchSection() {
  const [query, setQuery] = useState("");
  const [region, setRegion] = useYoutubeSearchRegion();
  const [reference, setReference] = useState<VideoListItem | null>(null);

  const useHit = (hit: YoutubeSearchHit) => {
    setReference(hitAsVideo(hit));
  };

  return (
    <section aria-labelledby="youtube-search-title" className="grid gap-4">
      <div className="grid gap-1">
        <h2 id="youtube-search-title" className="text-lg font-semibold">
          Chercher sur YouTube
        </h2>
        <p className="text-sm text-muted-foreground">
          Mots-clés sur tout YouTube. En tête : les miniatures qui surperforment vs la moyenne de leur chaîne.
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <LibrarySearchInput
          className="min-w-0 flex-1"
          value={query}
          onChange={setQuery}
          placeholder="Notion tutoriel, Grok, LLM local…"
          label="Rechercher des miniatures YouTube"
        />
        <YoutubeRegionSelect value={region} onChange={setRegion} />
      </div>
      <YoutubeSearchResults query={query} region={region} onUse={useHit} />
      {reference && <UseAsReferenceDialog video={reference} onClose={() => setReference(null)} />}
    </section>
  );
}
