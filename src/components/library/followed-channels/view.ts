import type { VideoPerformance } from "@/lib/youtube/performance";
import { thumbTypeLabel, type ThumbTypeFilter } from "@/lib/youtube/thumb-types";
import { QUOTA_SYNC_ERROR, type ChannelListItem, type ChannelsResponse } from "@/lib/youtube/types";

/** Pure display helpers for « Chaînes suivies » (French formats, labels, badge tones). */

const plainSpaces = (text: string) => text.replace(/[  ]/g, " ");
const countFormat = new Intl.NumberFormat("fr-FR");
const compactFormat = new Intl.NumberFormat("fr-FR", { notation: "compact", maximumFractionDigits: 1 });
const plural = (count: number, singular: string, pluralForm = `${singular}s`) => (count > 1 ? pluralForm : singular);

export function formatCount(value: number): string {
  return plainSpaces(countFormat.format(Math.round(value)));
}

export function formatCompact(value: number): string {
  return plainSpaces(compactFormat.format(value));
}

export function formatViews(views: number): string {
  return `${formatCompact(views)} ${plural(views, "vue")}`;
}

export function formatViewsPerDay(views: number): string {
  return `${formatCompact(views)} vues/j`;
}

export function formatSubscribers(count: number | null): string {
  if (count === null) return "abonnés masqués";
  return `${formatCompact(count)} ${plural(count, "abonné")}`;
}

export function formatScore(score: number): string {
  return `×${score.toFixed(1).replace(".", ",")}`;
}

export function formatUsd(amount: number): string {
  if (amount > 0 && amount < 0.005) return "moins de 0,01 $";
  return `${amount.toFixed(2).replace(".", ",")} $`;
}

export function formatRelativeTime(iso: string, now: Date): string {
  const minutes = Math.floor((now.getTime() - Date.parse(iso)) / 60_000);
  if (!Number.isFinite(minutes) || minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  return `il y a ${Math.floor(hours / 24)} j`;
}

export function formatPublishedDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

export function channelStatusLabel(
  channel: Pick<ChannelListItem, "syncStatus" | "syncError" | "lastSyncedAt" | "videoCount">,
  now: Date,
): string {
  if (channel.syncStatus === "syncing") {
    return `Synchronisation… ${formatCount(channel.videoCount)} ${plural(channel.videoCount, "vidéo")}`;
  }
  if (channel.syncStatus === "error") return channel.syncError === QUOTA_SYNC_ERROR ? QUOTA_SYNC_ERROR : "Erreur";
  return channel.lastSyncedAt ? `À jour ${formatRelativeTime(channel.lastSyncedAt, now)}` : "En attente";
}

export type PerformanceBadge = { label: string; hint: string; tone: "over" | "neutral" | "under" | "recent" };

export const PERFORMANCE_BADGE_CLASSES: Record<PerformanceBadge["tone"], string> = {
  over: "border-transparent bg-emerald-600 text-white",
  neutral: "border-transparent bg-background/90 text-foreground",
  under: "border-transparent bg-red-600 text-white",
  recent: "border-transparent bg-sky-600 text-white",
};

const BAND_HINTS = {
  over: "Surperforme : au moins 3 fois la médiane de la chaîne",
  neutral: "Dans la moyenne de la chaîne",
  under: "Sous-performe : moins de la moitié de la médiane de la chaîne",
} as const;

export function performanceBadge(performance: VideoPerformance): PerformanceBadge | null {
  if (performance.kind === "none") return null;
  if (performance.kind === "recent") {
    return {
      label: `Récente · ${formatViewsPerDay(performance.viewsPerDay)}`,
      hint: "Publiée il y a moins de 7 jours : pas encore de score",
      tone: "recent",
    };
  }
  return { label: formatScore(performance.score), hint: BAND_HINTS[performance.band], tone: performance.band };
}

export function typesFilterLabel(types: readonly ThumbTypeFilter[]): string {
  if (types.length === 0) return "Tous les types";
  if (types.length === 1) return thumbTypeLabel(types[0]);
  return `${types.length} types`;
}

export function toggleFilterValue<T extends string>(values: readonly T[], value: T, checked: boolean): T[] {
  const without = values.filter((item) => item !== value);
  return checked ? [...without, value] : without;
}

/** Changes whenever a sync or the classification made progress: lists refetch on it. */
export function channelsDataVersion(data: ChannelsResponse): string {
  const channels = data.channels
    .map((channel) => `${channel.id}:${channel.syncStatus}:${channel.lastSyncedAt ?? ""}:${channel.videoCount}`)
    .join("|");
  return `${channels}#${data.classification.pending}`;
}
