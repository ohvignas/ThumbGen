"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { ClassificationStatus } from "@/lib/youtube/types";
import { ApiError, channelsApi } from "./api";
import { formatCount, formatUsd } from "./view";

type Props = { status: ClassificationStatus; onChanged: () => void };

export default function ClassificationNotice({ status, onChanged }: Props) {
  const [dismissed, setDismissed] = useState(false);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!status.enabled || !status.hasKey) return null;

  if (status.awaitingConfirmation > 0 && !dismissed) {
    const approve = async () => {
      setApproving(true);
      setError(null);
      try {
        await channelsApi.approveClassification();
        onChanged();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Lancement impossible");
      } finally {
        setApproving(false);
      }
    };

    return (
      <Alert>
        <Sparkles />
        <AlertTitle>Classer {formatCount(status.awaitingConfirmation)} miniatures par type ?</AlertTitle>
        <AlertDescription className="grid gap-2">
          <span>
            {status.modelLabel} range chaque miniature par type (visage + texte, avant / après…). Coût estimé : environ{" "}
            {formatUsd(status.estimatedCostUsd)}. Tu pourras corriger chaque type à la main.
          </span>
          {error && <span className="text-destructive">{error}</span>}
          <span className="flex flex-wrap gap-2">
            <Button size="sm" disabled={approving} onClick={() => void approve()}>
              {approving ? "Lancement…" : "Lancer le classement"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDismissed(true)}>
              Plus tard
            </Button>
          </span>
        </AlertDescription>
      </Alert>
    );
  }

  if (status.running) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Classement IA en cours · {formatCount(status.pending)}{" "}
        {status.pending > 1 ? "miniatures restantes" : "miniature restante"}
      </p>
    );
  }

  return null;
}
