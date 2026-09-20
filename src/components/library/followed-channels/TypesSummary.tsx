"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { performanceBand } from "@/lib/youtube/performance";
import { classifyVideoFormat, videoFormatLabel } from "@/lib/youtube/video-formats";
import { WORKING_VIDEO_COUNT, type VideoListItem, type WorkingSubjectHit } from "@/lib/youtube/types";
import { channelsApi } from "./api";
import {
  PERFORMANCE_BADGE_CLASSES,
  climbHint,
  formatJevNote,
  formatScore,
  formatViewsPerHour,
  performanceBandLabel,
} from "./view";
import { cn } from "cn";

type Props = {
  version: string;
  onOpen: (video: VideoListItem) => void;
  onSubject: (subject: WorkingSubjectHit | null) => void;
};

export default function TypesSummary({ version, onOpen, onSubject }: Props) {
  const [subject, setSubject] = useState<WorkingSubjectHit | null>(null);
  const [items, setItems] = useState<VideoListItem[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    channelsApi
      .workingSubject()
      .then((response) => {
        if (cancelled) return;
        setSubject(response.subject);
        onSubject(response.subject);
        setItems(response.videos.slice(0, WORKING_VIDEO_COUNT));
        setFailed(false);
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true);
          setSubject(null);
          onSubject(null);
          setItems([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [version, onSubject]);

  return (
    <Card>
      <CardHeader className="gap-3">
        <CardTitle>🏆 Tendance Youtube</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        {failed ? (
          <p className="text-sm text-destructive">Impossible de calculer la tendance.</p>
        ) : items === null ? (
          <div className="grid gap-2">
            <Skeleton className="h-6 w-48" />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {Array.from({ length: WORKING_VIDEO_COUNT }, (_, index) => (
                <Skeleton key={index} className="aspect-video w-full" />
              ))}
            </div>
          </div>
        ) : !subject || items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune vidéo qui performe ces 7 derniers jours sur tes chaînes suivies.</p>
        ) : (
          <div className="grid gap-3">
            <p className="text-sm text-muted-foreground">{subject.why}</p>
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {items.map((video) => (
                <li key={video.videoId}>
                  <WorkingThumb video={video} onOpen={onOpen} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function WorkingThumb({ video, onOpen }: { video: VideoListItem; onOpen: (video: VideoListItem) => void }) {
  const format = videoFormatLabel(video.formatId ?? classifyVideoFormat(video.title, video.description, video.durationSeconds));
  const cote = video.overperformance != null && video.overperformance > 0 ? formatScore(video.overperformance) : null;
  const band =
    video.overperformance != null && video.overperformance >= 0.5 ? performanceBand(video.overperformance) : null;
  const climb = video.viewsPerHour != null ? formatViewsPerHour(video.viewsPerHour) : null;
  const note = video.jevNote != null ? formatJevNote(video.jevNote) : null;

  return (
    <button
      type="button"
      data-working-video={video.videoId}
      onClick={() => onOpen(video)}
      className="grid gap-1.5 text-left"
      aria-label={`Détails de « ${video.title} »`}
      title={video.velocityKind ? climbHint(video.velocityKind) : undefined}
    >
      <span className="relative block aspect-video overflow-hidden rounded-md bg-muted">
        <img src={video.thumbnailUrl} alt="" className="size-full object-cover" />
        {cote ? (
          <Badge className={cn("absolute top-1.5 left-1.5", band ? PERFORMANCE_BADGE_CLASSES[band] : undefined)}>
            {cote}
          </Badge>
        ) : null}
        {note ? (
          <span className="absolute top-1.5 left-14 rounded-sm bg-background/90 px-1.5 py-0.5 text-[10px] font-medium tabular-nums">
            {note}
          </span>
        ) : null}
        {climb ? (
          <span className="absolute right-1.5 top-1.5 rounded-sm bg-background/90 px-1.5 py-0.5 text-[10px] font-medium">
            {climb}
          </span>
        ) : null}
        <span className="absolute right-1.5 bottom-1.5 rounded-sm bg-background/90 px-1.5 py-0.5 text-[10px] font-medium tracking-wide uppercase">
          {format}
        </span>
      </span>
      <span className="line-clamp-2 text-xs font-medium">{video.title}</span>
      <span className="truncate text-[11px] text-muted-foreground">{video.channelTitle}</span>
      {band ? <span className="text-[11px] font-medium">{performanceBandLabel(band)}</span> : null}
    </button>
  );
}
