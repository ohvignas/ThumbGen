"use client";

/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { Loader2 } from "lucide-react";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import type { YoutubeSearchHit } from "@/lib/youtube/types";
import { DEFAULT_YOUTUBE_SEARCH_REGION, type YoutubeSearchRegion } from "@/lib/youtube/search-regions";
import { YOUTUBE_SEARCH_MIN_CHARS } from "@/lib/youtube/swipe-rank";
import { MISSING_YOUTUBE_KEY_ERROR, youtubeWatchUrl } from "@/lib/youtube/types";
import { PERFORMANCE_BADGE_CLASSES, formatViews, performanceBadge } from "./followed-channels/view";
import { useYoutubeSearch } from "./useYoutubeSearch";

type Props = {
  query: string;
  region?: YoutubeSearchRegion;
  onUse: (hit: YoutubeSearchHit) => Promise<void> | void;
  usingId?: string | null;
};

export default function YoutubeSearchResults({
  query,
  region = DEFAULT_YOUTUBE_SEARCH_REGION,
  onUse,
  usingId,
}: Props) {
  const state = useYoutubeSearch(query, region);

  if (state.status === "idle") {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        Tape au moins {YOUTUBE_SEARCH_MIN_CHARS} lettres. Les miniatures les plus fortes vs la moyenne de leur chaîne
        arrivent en premier.
      </p>
    );
  }

  if (state.status === "loading") {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, index) => (
          <Skeleton key={index} className="aspect-video w-full" />
        ))}
      </div>
    );
  }

  if (state.status === "error") {
    const missingKey = state.message === MISSING_YOUTUBE_KEY_ERROR;
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>{missingKey ? "Clé YouTube manquante" : "Recherche impossible"}</EmptyTitle>
          <EmptyDescription>{state.message}</EmptyDescription>
        </EmptyHeader>
        {missingKey && (
          <EmptyContent>
            <Link href="/reglages/connexions" target="_blank" className={buttonVariants({ variant: "outline" })}>
              Ouvrir Réglages → Connexions
            </Link>
          </EmptyContent>
        )}
      </Empty>
    );
  }

  if (state.response.items.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">Aucune miniature pour « {query.trim()} ».</p>
    );
  }

  return (
    <div className="grid gap-3">
      {state.response.jevUsed && (
        <p className="text-xs text-muted-foreground">Titres affinés avec TypeSafe Jev.</p>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {state.response.items.map((hit) => {
          const badge = performanceBadge(hit.performance);
          return (
            <article key={hit.videoId} className="grid gap-1.5">
              <a
                href={youtubeWatchUrl(hit.videoId)}
                target="_blank"
                rel="noopener noreferrer"
                className="relative block aspect-video overflow-hidden rounded-md bg-muted"
                aria-label={`Voir « ${hit.title} » sur YouTube`}
              >
                <img src={hit.thumbnailUrl} alt="" loading="lazy" className="size-full object-cover" />
                {badge && (
                  <Badge className={cn("absolute top-1.5 left-1.5", PERFORMANCE_BADGE_CLASSES[badge.tone])}>
                    {badge.label}
                  </Badge>
                )}
              </a>
              <p className="line-clamp-2 text-xs font-medium" title={hit.title}>
                {hit.title}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {hit.channelTitle} · {formatViews(hit.viewCount)}
              </p>
              <Button
                size="sm"
                variant="outline"
                disabled={usingId !== null && usingId !== undefined}
                onClick={() => void onUse(hit)}
              >
                {usingId === hit.videoId ? <Loader2 className="size-4 animate-spin" /> : "Utiliser comme référence"}
              </Button>
            </article>
          );
        })}
      </div>
    </div>
  );
}
