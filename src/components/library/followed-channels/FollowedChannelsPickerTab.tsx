"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { cn } from "cn";
import type { LibraryPick } from "@/components/library/picker-tabs";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import {
  VIDEO_MAX_LIMIT,
  VIDEO_PAGE_SIZE,
  type ChannelsResponse,
  type VideoListItem,
  type VideoListResponse,
} from "@/lib/youtube/types";
import { ApiError, channelsApi } from "./api";
import { PERFORMANCE_BADGE_CLASSES, formatViews, performanceBadge } from "./view";

type Props = { query: string; onPick: (item: LibraryPick) => void };

/** Followed-channel thumbnails sorted by score, for a reference-image node. Picking copies into the library first. */
export default function FollowedChannelsPickerTab({ query, onPick }: Props) {
  const [search, setSearch] = useState(query.trim());
  const [pages, setPages] = useState(1);
  const [channels, setChannels] = useState<ChannelsResponse | null>(null);
  const [result, setResult] = useState<VideoListResponse | null>(null);
  const [picking, setPicking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const limit = Math.min(VIDEO_PAGE_SIZE * pages, VIDEO_MAX_LIMIT);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(query.trim());
      setPages(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    channelsApi
      .list()
      .then((data) => {
        if (!cancelled) setChannels(data);
      })
      .catch(() => {
        if (!cancelled) setError("Impossible de charger les chaînes suivies.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    channelsApi
      .videos({ sort: "score", q: search, offset: 0, limit })
      .then((data) => {
        if (!cancelled) setResult(data);
      })
      .catch(() => {
        if (!cancelled) setError("Impossible de charger les miniatures.");
      });
    return () => {
      cancelled = true;
    };
  }, [search, limit]);

  const pick = async (video: VideoListItem) => {
    setPicking(video.videoId);
    setError(null);
    try {
      const copy = await channelsApi.use(video.videoId);
      onPick({ imageUrl: copy.imageUrl, label: copy.label });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Copie impossible");
    } finally {
      setPicking(null);
    }
  };

  if (channels && !channels.youtubeConfigured) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Clé YouTube manquante</EmptyTitle>
          <EmptyDescription>Ajoute ta clé YouTube (gratuite) pour retrouver ici les miniatures des chaînes que tu suis.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Link href="/reglages/connexions" target="_blank" className={buttonVariants({ variant: "outline" })}>
            Ouvrir Réglages → Connexions
          </Link>
        </EmptyContent>
      </Empty>
    );
  }

  if (channels && channels.channels.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Aucune chaîne suivie</EmptyTitle>
          <EmptyDescription>Suis une chaîne dans la Bibliothèque pour choisir parmi ses miniatures.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Link href="/bibliotheque?onglet=inspirations" target="_blank" className={buttonVariants({ variant: "outline" })}>
            Suivre une chaîne
          </Link>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <div className="grid gap-3">
      {error && <p className="text-sm text-destructive">{error}</p>}
      {result === null ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="aspect-video w-full" />
          ))}
        </div>
      ) : result.items.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {search ? `Aucune miniature ne correspond à « ${search} ».` : "Aucune miniature importée pour l'instant."}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {result.items.map((video) => {
            const badge = performanceBadge(video.performance);
            return (
              <Button
                key={video.videoId}
                variant="ghost"
                disabled={picking !== null}
                onClick={() => void pick(video)}
                className="h-auto w-full min-w-0 flex-col items-stretch gap-1 p-1 text-left whitespace-normal"
              >
                <span className="relative block aspect-video overflow-hidden rounded-md bg-muted">
                  <img src={video.thumbnailUrl} alt="" loading="lazy" className="size-full object-cover" />
                  {badge && (
                    <Badge className={cn("absolute top-1.5 left-1.5", PERFORMANCE_BADGE_CLASSES[badge.tone])}>{badge.label}</Badge>
                  )}
                  {picking === video.videoId && (
                    <span className="absolute inset-0 flex items-center justify-center bg-background/70">
                      <Loader2 className="size-5 animate-spin" />
                    </span>
                  )}
                </span>
                <span className="line-clamp-2 text-xs font-medium">{video.title}</span>
                <span className="truncate text-xs font-normal text-muted-foreground">
                  {video.channelTitle} · {formatViews(video.viewCount)}
                </span>
              </Button>
            );
          })}
        </div>
      )}
      {result && result.items.length < result.total && limit < VIDEO_MAX_LIMIT && (
        <Button variant="outline" size="sm" className="justify-self-center" onClick={() => setPages((count) => count + 1)}>
          Voir plus
        </Button>
      )}
    </div>
  );
}
