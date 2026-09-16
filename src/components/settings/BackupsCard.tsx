"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Trash2 } from "lucide-react";
import { cn } from "cn";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { BackupEntry } from "@/lib/data-admin";
import { readApiError } from "./api";
import ConfirmDialog from "./ConfirmDialog";
import { formatBytes, formatDateTime } from "./format";

export default function BackupsCard() {
  const [backups, setBackups] = useState<BackupEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [toDelete, setToDelete] = useState<BackupEntry | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/data/backups", { cache: "no-store" });
      if (!res.ok) throw new Error(await readApiError(res, "Liste des sauvegardes indisponible."));
      setBackups((await res.json()) as BackupEntry[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Liste des sauvegardes indisponible.");
      setBackups([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/data/backups", { method: "POST" });
      if (!res.ok) {
        setError(await readApiError(res, "Échec de la sauvegarde."));
        return;
      }
      await load();
    } catch {
      setError("Échec de la sauvegarde — vérifie ta connexion.");
    } finally {
      setCreating(false);
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/data/backups?name=${encodeURIComponent(toDelete.name)}`, { method: "DELETE" });
      if (!res.ok) {
        setError(await readApiError(res, "Suppression impossible."));
        return;
      }
      setToDelete(null);
      await load();
    } catch {
      setError("Suppression impossible — vérifie ta connexion.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sauvegardes</CardTitle>
        <CardDescription>Copies complètes de la base, enregistrées dans data/backups/.</CardDescription>
        <CardAction>
          <Button type="button" disabled={creating} onClick={() => void create()}>
            {creating ? "Sauvegarde…" : "Créer une sauvegarde"}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {backups === null ? (
          <div className="grid gap-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : backups.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune sauvegarde pour l&apos;instant.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fichier</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Taille</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {backups.map((backup) => (
                <TableRow key={backup.name}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs">{backup.name}</span>
                      {backup.legacy && <Badge variant="outline">ancienne copie</Badge>}
                    </div>
                  </TableCell>
                  <TableCell>{formatDateTime(backup.createdAt)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatBytes(backup.size)}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <a
                        href={`/api/data/backups/download?name=${encodeURIComponent(backup.name)}`}
                        className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))}
                        aria-label={`Télécharger ${backup.name}`}
                      >
                        <Download />
                      </a>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Supprimer ${backup.name}`}
                        onClick={() => setToDelete(backup)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <Alert>
          <AlertTitle>Restaurer une sauvegarde</AlertTitle>
          <AlertDescription>
            <ol className="list-decimal space-y-1 pl-4">
              <li>
                Arrête le container : <code className="font-mono">docker compose stop thumbgen</code>.
              </li>
              <li>
                Remplace <code className="font-mono">data/thumbgen.db</code> par la copie choisie, renommée{" "}
                <code className="font-mono">thumbgen.db</code>.
              </li>
              <li>
                Supprime <code className="font-mono">data/thumbgen.db-wal</code> et{" "}
                <code className="font-mono">data/thumbgen.db-shm</code> s&apos;ils existent.
              </li>
              <li>
                Redémarre : <code className="font-mono">docker compose start thumbgen</code>.
              </li>
            </ol>
          </AlertDescription>
        </Alert>
      </CardContent>
      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => {
          if (!open) setToDelete(null);
        }}
        title="Supprimer cette sauvegarde ?"
        description={toDelete ? `${toDelete.name} sera supprimé définitivement du disque.` : ""}
        confirmLabel="Supprimer"
        busy={deleting}
        onConfirm={() => void confirmDelete()}
      />
    </Card>
  );
}
