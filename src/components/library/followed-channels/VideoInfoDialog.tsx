"use client";

/* eslint-disable @next/next/no-img-element */

import { ExternalLink, ImagePlus } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { classifyVideoFormat, videoFormatLabel } from "@/lib/youtube/video-formats";
import { WORKING_PERIOD_LABELS, youtubeWatchUrl, type VideoListItem, type WorkingPeriod } from "@/lib/youtube/types";
import { performanceBand } from "@/lib/youtube/performance";
import WhyPerformanceSection from "./WhyPerformanceSection";
import {
  descriptionExcerpt,
  formatCompact,
  formatJevNote,
  formatPublishedDate,
  formatScore,
  formatVideoAge,
  formatViews,
  performanceBandLabel,
} from "./view";

type Props = {
  video: VideoListItem;
  period: WorkingPeriod;
  subjectLabel: string | null;
  onClose: () => void;
  onUse: (video: VideoListItem) => void;
};

function coteLine(video: VideoListItem): { figure: string; caption: string } {
  const score = video.overperformance ?? (video.performance.kind === "scored" ? video.performance.score : null);
  if (score != null) {
    return { figure: formatScore(score), caption: performanceBandLabel(performanceBand(score)) };
  }
  if (video.performance.kind === "recent") {
    return { figure: `${formatCompact(video.performance.viewsPerDay)}/j`, caption: "trop tôt pour un ×N" };
  }
  return { figure: "—", caption: "score indisponible" };
}

export default function VideoInfoDialog({ video, period, subjectLabel, onClose, onUse }: Props) {
  const watchUrl = youtubeWatchUrl(video.videoId);
  const format = videoFormatLabel(video.formatId ?? classifyVideoFormat(video.title, video.description, video.durationSeconds));
  const cote = coteLine(video);
  const note = video.jevNote != null ? formatJevNote(video.jevNote) : null;
  const excerpt = descriptionExcerpt(video.description);
  const age = formatVideoAge(video.publishedAt);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto p-0 sm:max-w-xl" aria-describedby="video-info-meta">
        <div className="relative">
          <img src={video.thumbnailUrl} alt="" className="aspect-video w-full object-cover" />
          <div className="absolute right-3 bottom-3 grid min-w-20 place-items-center rounded-sm bg-background/95 px-3 py-2 text-center shadow-sm ring-1 ring-foreground/15">
            <span className="text-[10px] tracking-[0.18em] text-muted-foreground uppercase">Cote</span>
            <span className="font-heading text-2xl leading-none tabular-nums">{cote.figure}</span>
            <span className="mt-1 text-[11px] text-muted-foreground">{cote.caption}</span>
          </div>
        </div>

        <div className="grid gap-3 border-t border-dashed px-4 pt-3 pb-4">
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
            {subjectLabel ? (
              <>
                <span className="rounded-sm bg-foreground px-1.5 py-0.5 text-background">{subjectLabel}</span>
                <span aria-hidden>·</span>
              </>
            ) : null}
            <span className="rounded-sm bg-muted px-1.5 py-0.5 text-foreground">{format}</span>
            {note ? (
              <>
                <span aria-hidden>·</span>
                <span className="tabular-nums text-foreground">{note}</span>
              </>
            ) : null}
            <span aria-hidden>·</span>
            <span>{WORKING_PERIOD_LABELS[period]}</span>
          </div>

          <DialogHeader className="gap-1 p-0">
            <DialogTitle className="pr-8 text-balance">{video.title}</DialogTitle>
            <DialogDescription id="video-info-meta" className="text-pretty">
              <span>{video.channelTitle}</span>
              {" · "}
              <span>{formatPublishedDate(video.publishedAt)}</span>
              {" · "}
              <span>{age}</span>
            </DialogDescription>
          </DialogHeader>

          <p className="text-pretty text-sm">
            <span className="tabular-nums">{formatViews(video.viewCount)}</span>
            <span className="text-muted-foreground">{" "}dans cette fenêtre</span>
          </p>

          {excerpt ? <p className="text-sm text-pretty text-muted-foreground">{excerpt}</p> : null}

          <WhyPerformanceSection video={video} />

          <DialogFooter className="p-0 sm:justify-between">
            <a href={watchUrl} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline" })}>
              <ExternalLink />
              Voir sur YouTube
            </a>
            <Button
              type="button"
              onClick={() => {
                onUse(video);
                onClose();
              }}
            >
              <ImagePlus />
              Utiliser comme référence
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
