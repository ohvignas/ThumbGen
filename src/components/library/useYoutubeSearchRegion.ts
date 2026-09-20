"use client";

import { useState } from "react";
import {
  parseYoutubeSearchRegion,
  readStoredYoutubeSearchRegion,
  writeStoredYoutubeSearchRegion,
  type YoutubeSearchRegion,
} from "@/lib/youtube/search-regions";

export function useYoutubeSearchRegion(): [YoutubeSearchRegion, (region: YoutubeSearchRegion) => void] {
  const [region, setRegion] = useState<YoutubeSearchRegion>(readStoredYoutubeSearchRegion);

  const update = (next: YoutubeSearchRegion) => {
    const parsed = parseYoutubeSearchRegion(next);
    setRegion(parsed);
    writeStoredYoutubeSearchRegion(parsed);
  };

  return [region, update];
}
