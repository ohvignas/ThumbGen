"use client";

import { useEffect, useState } from "react";
import LibrarySearchInput from "@/components/library/LibrarySearchInput";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { VIDEO_FORMAT_OPTIONS, type VideoFormatId } from "@/lib/youtube/video-formats";
import {
  VIDEO_MAX_LIMIT,
  VIDEO_SORTS,
  WORKING_PERIODS,
  WORKING_PERIOD_LABELS,
  type ChannelListItem,
  type VideoListItem,
  type VideoListResponse,
  type VideoSort,
  type WorkingPeriod,
} from "@/lib/youtube/types";
import { channelsApi } from "./api";
import VideoCard from "./VideoCard";
import { formatCount } from "./view";

const SORT_LABELS: Record<VideoSort, string> = { score: "Score", views: "Vues", date: "Date" };
const ALL_CHANNELS = "__all__";
const ALL_FORMATS = "__all__";
const GRID_PAGE = 12;
const GRID = "grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4";

type Filters = { sort: VideoSort; channelId: string | null; q: string; format: VideoFormatId | "" };

type Props = {
  channels: ChannelListItem[];
  version: string;
  period: WorkingPeriod;
  onPeriod: (period: WorkingPeriod) => void;
  onOpen: (video: VideoListItem) => void;
  onUse: (video: VideoListItem) => void;
};

export default function VideoGrid({ channels, version, period, onPeriod, onOpen, onUse }: Props) {
  const [filters, setFilters] = useState<Filters>({ sort: "score", channelId: null, q: "", format: "" });
  const [draftQuery, setDraftQuery] = useState("");
  const [pages, setPages] = useState(1);
  const [result, setResult] = useState<VideoListResponse | null>(null);
  const [failed, setFailed] = useState(false);

  const limit = Math.min(GRID_PAGE * pages, VIDEO_MAX_LIMIT);
  const channelId = filters.channelId && channels.some((channel) => channel.id === filters.channelId) ? filters.channelId : null;

  useEffect(() => {
    const timer = setTimeout(() => {
      const next = draftQuery.trim();
      setFilters((previous) => (previous.q === next ? previous : { ...previous, q: next }));
    }, 300);
    return () => clearTimeout(timer);
  }, [draftQuery]);

  useEffect(() => {
    setPages(1);
  }, [period, filters.format, filters.channelId, filters.sort, filters.q]);

  useEffect(() => {
    let cancelled = false;
    channelsApi
      .videos({
        sort: filters.sort,
        channelId,
        period,
        q: filters.q,
        format: filters.format,
        offset: 0,
        limit,
      })
      .then((next) => {
        if (cancelled) return;
        setResult(next);
        setFailed(false);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [filters.sort, filters.q, filters.format, period, channelId, limit, version]);

  const update = (patch: Partial<Filters>) => {
    setFilters((previous) => ({ ...previous, ...patch }));
    setPages(1);
  };

  const channelItems = [
    { value: ALL_CHANNELS, label: "Toutes les chaînes" },
    ...channels.map((channel) => ({ value: channel.id, label: channel.title })),
  ];
  const formatItems = [
    { value: ALL_FORMATS, label: "Tous les types de vidéo" },
    ...VIDEO_FORMAT_OPTIONS.map((option) => ({ value: option.id, label: option.label })),
  ];

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <LibrarySearchInput
          value={draftQuery}
          onChange={setDraftQuery}
          placeholder="Sujet ou mot-clé…"
          label="Rechercher un sujet parmi les chaînes suivies"
          className="max-w-xs"
        />

        <Select
          items={formatItems}
          value={filters.format || ALL_FORMATS}
          onValueChange={(value) => update({ format: !value || value === ALL_FORMATS ? "" : (value as VideoFormatId) })}
        >
          <SelectTrigger size="sm" className="w-52" aria-label="Type de vidéo">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {formatItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          items={channelItems}
          value={channelId ?? ALL_CHANNELS}
          onValueChange={(value) => update({ channelId: !value || value === ALL_CHANNELS ? null : value })}
        >
          <SelectTrigger size="sm" className="w-48" aria-label="Chaîne">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {channelItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <ToggleGroup
          variant="outline"
          size="sm"
          aria-label="Fenêtre"
          value={[period]}
          onValueChange={(value) => {
            const next = WORKING_PERIODS.find((item) => item === value[0]);
            if (next) onPeriod(next);
          }}
        >
          {WORKING_PERIODS.map((item) => (
            <ToggleGroupItem key={item} value={item}>
              {WORKING_PERIOD_LABELS[item]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        <ToggleGroup
          variant="outline"
          size="sm"
          aria-label="Trier par"
          value={[filters.sort]}
          onValueChange={(value) => {
            const next = VIDEO_SORTS.find((sort) => sort === value[0]);
            if (next) update({ sort: next });
          }}
        >
          {VIDEO_SORTS.map((sort) => (
            <ToggleGroupItem key={sort} value={sort}>
              {SORT_LABELS[sort]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        {result && (
          <span className="ml-auto text-sm text-muted-foreground">
            {formatCount(result.total)} {result.total > 1 ? "vidéos" : "vidéo"} · {WORKING_PERIOD_LABELS[period]}
          </span>
        )}
      </div>

      {failed && (
        <Alert variant="destructive">
          <AlertTitle>Impossible de charger les miniatures.</AlertTitle>
        </Alert>
      )}

      {result === null ? (
        <div className={GRID}>
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="aspect-video w-full" />
          ))}
        </div>
      ) : result.items.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>Aucune vidéo</EmptyTitle>
            <EmptyDescription>Rien ne correspond à ces filtres pour l&apos;instant.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className={GRID}>
          {result.items.map((video) => (
            <VideoCard key={video.videoId} video={video} onOpen={onOpen} onUse={onUse} />
          ))}
        </div>
      )}

      {result && result.items.length < result.total ? (
        limit < VIDEO_MAX_LIMIT ? (
          <Button variant="outline" className="justify-self-center" onClick={() => setPages((count) => count + 1)}>
            Voir plus
          </Button>
        ) : (
          <p className="text-center text-sm text-muted-foreground">Affine les filtres pour voir les autres vidéos.</p>
        )
      ) : null}
    </div>
  );
}
