"use client";

/* eslint-disable @next/next/no-img-element */

import { ExternalLink, MoreHorizontal } from "lucide-react";
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
import type { ThumbType } from "@/lib/youtube/thumb-types";
import { youtubeWatchUrl, type VideoListItem } from "@/lib/youtube/types";
import ThumbTypeMenu from "./ThumbTypeMenu";
import { PERFORMANCE_BADGE_CLASSES, formatPublishedDate, formatViews, performanceBadge } from "./view";

type Props = {
  video: VideoListItem;
  onTypeChanged: (videoId: string, thumbType: ThumbType) => void;
};

export default function VideoCard({ video, onTypeChanged }: Props) {
  const badge = performanceBadge(video.performance);
  const watchUrl = youtubeWatchUrl(video.videoId);

  return (
    <Card className="gap-0 py-0">
      <a
        href={watchUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="relative block aspect-video overflow-hidden bg-muted"
        aria-label={`Voir « ${video.title} » sur YouTube`}
      >
        <img src={video.thumbnailUrl} alt="" loading="lazy" className="size-full object-cover" />
        {badge && (
          <Badge className={cn("absolute top-2 left-2", PERFORMANCE_BADGE_CLASSES[badge.tone])} title={badge.hint}>
            {badge.label}
          </Badge>
        )}
      </a>
      <div className="grid gap-2 p-3">
        <p className="line-clamp-2 min-h-10 text-sm font-medium" title={video.title}>
          {video.title}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {video.channelTitle} · {formatPublishedDate(video.publishedAt)} · {formatViews(video.viewCount)}
        </p>
        <div className="flex items-center justify-between gap-2">
          <ThumbTypeMenu video={video} onChanged={onTypeChanged} />
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
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </Card>
  );
}
