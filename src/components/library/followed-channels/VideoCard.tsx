"use client";

/* eslint-disable @next/next/no-img-element */

import { ExternalLink, ImagePlus, MoreHorizontal } from "lucide-react";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { classifyVideoFormat, videoFormatLabel } from "@/lib/youtube/video-formats";
import { youtubeWatchUrl, type VideoListItem } from "@/lib/youtube/types";
import { PERFORMANCE_BADGE_CLASSES, formatPublishedDate, formatViews, performanceBadge } from "./view";

type Props = {
  video: VideoListItem;
  onOpen: (video: VideoListItem) => void;
  onUse: (video: VideoListItem) => void;
};

export default function VideoCard({ video, onOpen, onUse }: Props) {
  const badge = performanceBadge(video.performance);
  const watchUrl = youtubeWatchUrl(video.videoId);
  const format = videoFormatLabel(classifyVideoFormat(video.title, video.description, video.durationSeconds));

  return (
    <Card className="gap-0 py-0">
      <button
        type="button"
        onClick={() => onOpen(video)}
        className="relative block aspect-video w-full overflow-hidden bg-muted"
        aria-label={`Détails de « ${video.title} »`}
      >
        <img src={video.thumbnailUrl} alt="" loading="lazy" className="size-full object-cover" />
        {badge && (
          <Badge className={cn("absolute top-2 left-2", PERFORMANCE_BADGE_CLASSES[badge.tone])} title={badge.hint}>
            {badge.label}
          </Badge>
        )}
      </button>
      <div className="grid gap-2 p-3">
        <p className="line-clamp-2 min-h-10 text-sm font-medium" title={video.title}>
          {video.title}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {video.channelTitle} · {formatPublishedDate(video.publishedAt)} · {formatViews(video.viewCount)}
        </p>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">{format}</span>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" size="icon-sm" aria-label={`Actions pour ${video.title}`}>
                  <MoreHorizontal />
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={() => window.open(watchUrl, "_blank", "noopener,noreferrer")}>
                  <ExternalLink />
                  Voir sur YouTube
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onUse(video)}>
                  <ImagePlus />
                  Utiliser comme référence
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </Card>
  );
}
