"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { TypeSummaryRow } from "@/lib/youtube/thumb-types";
import { youtubeWatchUrl, type ChannelListItem } from "@/lib/youtube/types";
import { channelsApi } from "./api";
import { formatCount, formatScore } from "./view";

type Props = { channels: ChannelListItem[]; version: string };

export default function TypesSummary({ channels, version }: Props) {
  const [scope, setScope] = useState("all");
  const [rows, setRows] = useState<TypeSummaryRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  const scopeItems = [
    { value: "all", label: "Toutes les chaînes" },
    ...(channels.some((channel) => channel.isMine) ? [{ value: "mine", label: "Ma chaîne" }] : []),
    ...channels.filter((channel) => !channel.isMine).map((channel) => ({ value: channel.id, label: channel.title })),
  ];
  const effectiveScope = scopeItems.some((item) => item.value === scope) ? scope : "all";

  useEffect(() => {
    let cancelled = false;
    channelsApi
      .typesSummary(effectiveScope)
      .then((response) => {
        if (cancelled) return;
        setRows(response.rows);
        setFailed(false);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [effectiveScope, version]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Les types qui marchent</CardTitle>
        <CardDescription>
          Score médian des miniatures de chaque type. Un type est classé à partir de 3 miniatures notées.
        </CardDescription>
        <CardAction>
          <Select
            items={scopeItems}
            value={effectiveScope}
            onValueChange={(value) => {
              if (value) setScope(value);
            }}
          >
            <SelectTrigger size="sm" className="w-48" aria-label="Portée">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {scopeItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardAction>
      </CardHeader>
      <CardContent>
        {failed ? (
          <p className="text-sm text-destructive">Impossible de charger le classement des types.</p>
        ) : rows === null ? (
          <Skeleton className="h-32 w-full" />
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune miniature classée pour l&apos;instant.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Score médian</TableHead>
                <TableHead className="text-right">Miniatures</TableHead>
                <TableHead>Meilleure miniature</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.type}>
                  <TableCell className="font-medium">{row.label}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.enoughData && row.medianScore !== null ? (
                      formatScore(row.medianScore)
                    ) : (
                      <span className="text-muted-foreground">peu de données</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatCount(row.totalCount)}</TableCell>
                  <TableCell>
                    {row.best ? (
                      <a
                        href={youtubeWatchUrl(row.best.videoId)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex min-w-0 items-center gap-2"
                      >
                        <img src={row.best.thumbnailUrl} alt="" className="aspect-video w-20 shrink-0 rounded object-cover" />
                        <span className="line-clamp-1 max-w-56 text-sm">{row.best.title}</span>
                        <Badge variant="outline">{formatScore(row.best.score)}</Badge>
                      </a>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
