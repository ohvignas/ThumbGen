"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { CleanupCandidates, CleanupResult } from "@/lib/data-admin";
import { readApiError } from "./api";
import ConfirmDialog from "./ConfirmDialog";
import { formatBytes } from "./format";

export default function CleanupCard({ onCleaned }: { onCleaned: () => void }) {
  const [candidates, setCandidates] = useState<CleanupCandidates | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [result, setResult] = useState<CleanupResult | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/data/cleanup", { cache: "no-store" });
      if (!res.ok) throw new Error(await readApiError(res, "Comptage impossible."));
      setCandidates((await res.json()) as CleanupCandidates);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Comptage impossible.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async () => {
    setCleaning(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/data/cleanup", { method: "POST" });
      if (!res.ok) {
        setError(await readApiError(res, "Échec du nettoyage."));
        return;
      }
      setResult((await res.json()) as CleanupResult);
      setConfirmOpen(false);
      onCleaned();
      await load();
    } catch {
      setError("Échec du nettoyage — vérifie ta connexion.");
    } finally {
      setCleaning(false);
    }
  };

  const total = candidates ? candidates.sketches + candidates.chatUploads : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nettoyage</CardTitle>
        <CardDescription>
          Supprime les croquis et les imports de chat jamais utilisés depuis plus de 24 h, puis compacte la base.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {candidates ? (
          <p className="text-sm">
            {candidates.sketches} croquis et {candidates.chatUploads} imports de chat concernés.
          </p>
        ) : (
          !error && <Skeleton className="h-5 w-72" />
        )}
        {result && (
          <Alert>
            <AlertDescription>
              {result.deletedSketches + result.deletedChatUploads} élément(s) supprimé(s) · base{" "}
              {formatBytes(result.bytesBefore)} → {formatBytes(result.bytesAfter)}
            </AlertDescription>
          </Alert>
        )}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </CardContent>
      <CardFooter>
        <Button type="button" variant="outline" disabled={candidates === null || cleaning} onClick={() => setConfirmOpen(true)}>
          Nettoyer…
        </Button>
      </CardFooter>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Nettoyer la base ?"
        description={`${total} élément(s) seront supprimés définitivement, puis la base sera compactée (VACUUM). L'application peut ralentir quelques secondes.`}
        confirmLabel="Nettoyer"
        busy={cleaning}
        onConfirm={() => void run()}
      />
    </Card>
  );
}
