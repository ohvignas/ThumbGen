"use client";

import { useEffect, useState } from "react";
import { ListFilter } from "lucide-react";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  THUMB_TYPES,
  UNCLASSIFIED_FILTER,
  UNCLASSIFIED_LABEL,
  type ThumbType,
  type ThumbTypeFilter,
} from "@/lib/youtube/thumb-types";
import {
  VIDEO_MAX_LIMIT,
  VIDEO_PAGE_SIZE,
  VIDEO_PERIODS,
  VIDEO_SORTS,
  type ChannelListItem,
  type VideoListItem,
  type VideoListResponse,
  type VideoPeriod,
  type VideoSort,
} from "@/lib/youtube/types";
import { channelsApi } from "./api";
import VideoCard from "./VideoCard";
import { formatCount, toggleFilterValue, typesFilterLabel } from "./view";

type Filters = { sort: VideoSort; types: ThumbTypeFilter[]; channelId: string | null; period: VideoPeriod };

const SORT_LABELS: Record<VideoSort, string> = { score: "Score", views: "Vues", date: "Date" };
const PERIOD_LABELS: Record<VideoPeriod, string> = { "30d": "30 jours", "12m": "12 mois", all: "Tout" };
const ALL_CHANNELS = "__all__";
const TYPE_OPTIONS: Array<{ id: ThumbTypeFilter; label: string }> = [
  ...THUMB_TYPES.map((type) => ({ id: type.id, label: type.label })),
  { id: UNCLASSIFIED_FILTER, label: UNCLASSIFIED_LABEL },
];
const GRID = "grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4";

type Props = { channels: ChannelListItem[]; version: string; onUse: (video: VideoListItem) => void };

export default function VideoGrid({ channels, version, onUse }: Props) {
  const [filters, setFilters] = useState<Filters>({ sort: "score", types: [], channelId: null, period: "all" });
  const [pages, setPages] = useState(1);
  const [result, setResult] = useState<VideoListResponse | null>(null);
  const [failed, setFailed] = useState(false);

  const limit = Math.min(VIDEO_PAGE_SIZE * pages, VIDEO_MAX_LIMIT);
  const channelId = filters.channelId && channels.some((channel) => channel.id === filters.channelId) ? filters.channelId : null;

  useEffect(() => {
    let cancelled = false;
    channelsApi
      .videos({ sort: filters.sort, types: filters.types, channelId, period: filters.period, offset: 0, limit })
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
  }, [filters.sort, filters.types, filters.period, channelId, limit, version]);

  const update = (patch: Partial<Filters>) => {
    setFilters((previous) => ({ ...previous, ...patch }));
    setPages(1);
  };

  const onTypeChanged = (videoId: string, thumbType: ThumbType) =>
    setResult((previous) =>
      previous && {
        ...previous,
        items: previous.items.map((item) => (item.videoId === videoId ? { ...item, thumbType, thumbTypeSource: "manual" } : item)),
      },
    );

  const channelItems = [
    { value: ALL_CHANNELS, label: "Toutes les chaînes" },
    ...channels.map((channel) => ({ value: channel.id, label: channel.title })),
  ];

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
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

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="outline" size="sm">
                <ListFilter />
                {typesFilterLabel(filters.types)}
              </Button>
            }
          />
          <DropdownMenuContent align="start" className="min-w-56">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Types de miniature</DropdownMenuLabel>
              {TYPE_OPTIONS.map((option) => (
                <DropdownMenuCheckboxItem
                  key={option.id}
                  checked={filters.types.includes(option.id)}
                  onCheckedChange={(checked) => update({ types: toggleFilterValue(filters.types, option.id, checked) })}
                >
                  {option.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>

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
          aria-label="Période"
          value={[filters.period]}
          onValueChange={(value) => {
            const next = VIDEO_PERIODS.find((period) => period === value[0]);
            if (next) update({ period: next });
          }}
        >
          {VIDEO_PERIODS.map((period) => (
            <ToggleGroupItem key={period} value={period}>
              {PERIOD_LABELS[period]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        {result && (
          <span className="ml-auto text-sm text-muted-foreground">
            {formatCount(result.total)} {result.total > 1 ? "miniatures" : "miniature"}
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
            <EmptyTitle>Aucune miniature</EmptyTitle>
            <EmptyDescription>Rien ne correspond à ces filtres pour l&apos;instant.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className={GRID}>
          {result.items.map((video) => (
            <VideoCard key={video.videoId} video={video} onTypeChanged={onTypeChanged} onUse={onUse} />
          ))}
        </div>
      )}

      {result && result.items.length < result.total ? (
        limit < VIDEO_MAX_LIMIT ? (
          <Button variant="outline" className="justify-self-center" onClick={() => setPages((count) => count + 1)}>
            Voir plus
          </Button>
        ) : (
          <p className="text-center text-sm text-muted-foreground">Affine les filtres pour voir les autres miniatures.</p>
        )
      ) : null}
    </div>
  );
}
