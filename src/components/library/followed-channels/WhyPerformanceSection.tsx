"use client";

import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import type { VideoListItem, WhyVideoResponse } from "@/lib/youtube/types";
import { whyCategoryLabel } from "@/lib/youtube/why-categories";
import { channelsApi } from "./api";
import {
  WHY_DISCLAIMER,
  captionSourceLabel,
  climbHint,
  formatJevNote,
  formatScore,
  formatViewsPerHour,
  holdBandLabel,
  whyFactsSentence,
} from "./view";

export default function WhyPerformanceSection({ video }: { video: VideoListItem }) {
  const [data, setData] = useState<WhyVideoResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    channelsApi
      .why(video.videoId)
      .then((body) => {
        if (!cancelled) {
          setData(body);
          setFailed(false);
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [video.videoId]);

  return (
    <section className="grid gap-2 border-t border-dashed pt-3" aria-labelledby="why-performs-title">
      <h3 id="why-performs-title" className="text-sm font-semibold">
        Pourquoi ça performe
      </h3>
      <p className="text-[11px] text-pretty text-muted-foreground">{WHY_DISCLAIMER}</p>
      {failed ? (
        <p className="text-sm text-destructive">Impossible de charger l&apos;analyse.</p>
      ) : data === null ? (
        <div className="grid gap-2">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : (
        <WhyBody data={data} video={video} />
      )}
    </section>
  );
}

function WhyBody({ data, video }: { data: WhyVideoResponse; video: VideoListItem }) {
  const { facts, captions, jev } = data;
  const cote =
    facts.performance.kind === "scored"
      ? formatScore(facts.performance.score)
      : facts.performance.kind === "recent"
        ? "trop tôt pour un ×N"
        : "score indisponible";
  const captionsMissing = captions.status === "missing" || captions.status === "blocked";

  return (
    <div className="grid gap-2 text-sm">
      <p className="text-pretty leading-relaxed">{whyFactsSentence({ performance: facts.performance, channelTitle: video.channelTitle, publishedAt: video.publishedAt, viewCount: video.viewCount })}</p>
      <p className="text-pretty">
        <span className="tabular-nums font-medium">{cote}</span>
        {facts.performance.kind === "scored" ? (
          <span className="text-muted-foreground"> vs médiane de la chaîne</span>
        ) : null}
      </p>
      {facts.viewsPerHour != null && facts.velocityKind ? (
        <p className="text-pretty text-muted-foreground" title={climbHint(facts.velocityKind)}>
          {formatViewsPerHour(facts.viewsPerHour)}
          {facts.velocityKind === "delta" ? " · ça grimpe" : " · moy. depuis publication"}
        </p>
      ) : null}
      <p className="text-[11px] text-pretty text-muted-foreground">{captionSourceLabel(captions)}</p>
      {captions.quotes.length > 0 ? (
        <blockquote className="grid gap-1 border-l-2 pl-3 text-pretty">
          {captions.quotes.map((quote) => (
            <p key={quote}>« {quote} »</p>
          ))}
        </blockquote>
      ) : captionsMissing ? (
        <p className="text-pretty text-muted-foreground">
          Sous-titres indisponibles : on s&apos;appuie sur le titre, la description et le ×N uniquement.
        </p>
      ) : null}
      {jev.used && jev.categoryId ? (
        <p className="text-pretty">
          Catégorie : <span className="font-medium">{whyCategoryLabel(jev.categoryId)}</span>
        </p>
      ) : null}
      {jev.used && jev.note != null ? (
        <p className="text-pretty">
          Note packaging (Jev) : <span className="tabular-nums">{formatJevNote(jev.note)}</span>
          <span className="text-muted-foreground"> — titre + accroche, pas le CTR</span>
        </p>
      ) : null}
      {jev.used && jev.holdBand ? (
        <p className="text-pretty text-muted-foreground">{holdBandLabel(jev.holdBand)}</p>
      ) : null}
    </div>
  );
}
