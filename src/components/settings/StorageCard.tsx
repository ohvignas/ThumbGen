"use client";

import { useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { StorageStats } from "@/lib/data-admin";
import { readApiError } from "./api";
import { formatBytes } from "./format";

const COUNT_ROWS: Array<{ key: keyof StorageStats["counts"]; label: string }> = [
  { key: "projects", label: "Projets" },
  { key: "conversations", label: "Conversations" },
  { key: "messages", label: "Messages" },
  { key: "generatedImages", label: "Images générées" },
  { key: "personas", label: "Personnages" },
  { key: "logos", label: "Logos" },
  { key: "swipeFiles", label: "Inspirations" },
  { key: "sketches", label: "Croquis" },
  { key: "chatUploads", label: "Uploads de chat" },
];

export default function StorageCard({ refreshKey }: { refreshKey: number }) {
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/data/stats", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(await readApiError(res, "Lecture des statistiques impossible."));
        return (await res.json()) as StorageStats;
      })
      .then((data) => {
        if (cancelled) return;
        setStats(data);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Lecture des statistiques impossible.");
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Stockage</CardTitle>
        <CardDescription>Taille de la base SQLite et nombre d&apos;éléments enregistrés.</CardDescription>
      </CardHeader>
      <CardContent>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : !stats ? (
          <div className="grid gap-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Élément</TableHead>
                <TableHead className="text-right">Valeur</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>Base de données (journal WAL compris)</TableCell>
                <TableCell className="text-right tabular-nums">{formatBytes(stats.dbBytes + stats.walBytes)}</TableCell>
              </TableRow>
              {COUNT_ROWS.map((row) => (
                <TableRow key={row.key}>
                  <TableCell>{row.label}</TableCell>
                  <TableCell className="text-right tabular-nums">{stats.counts[row.key].toLocaleString("fr-FR")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
