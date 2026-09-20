"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  parseYoutubeSearchRegion,
  YOUTUBE_SEARCH_REGION_ITEMS,
  type YoutubeSearchRegion,
} from "@/lib/youtube/search-regions";

export default function YoutubeRegionSelect({
  value,
  onChange,
}: {
  value: YoutubeSearchRegion;
  onChange: (region: YoutubeSearchRegion) => void;
}) {
  return (
    <Select
      items={YOUTUBE_SEARCH_REGION_ITEMS}
      value={value}
      onValueChange={(next) => {
        if (next) onChange(parseYoutubeSearchRegion(next));
      }}
    >
      <SelectTrigger className="w-full shrink-0 sm:w-44" aria-label="Pays des résultats YouTube">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {YOUTUBE_SEARCH_REGION_ITEMS.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
