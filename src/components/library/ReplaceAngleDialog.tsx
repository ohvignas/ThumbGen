"use client";

/* eslint-disable @next/next/no-img-element */

import { useState } from "react";
import { ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PHOTO_IMPORT, fileToDataUrl } from "@/lib/library/image-file";
import { PERSONA_ANGLES, PERSONA_ANGLE_LABELS, personaImageUrl, type PersonaAngle, type PersonaSummary } from "@/lib/personas";

/** « Remplacer un angle »: pick the angle's tile, then a photo — uploaded right away. */
export default function ReplaceAngleDialog({
  persona,
  photoVersion,
  onClose,
  onReplaced,
}: {
  persona: PersonaSummary;
  photoVersion: number;
  onClose: () => void;
  onReplaced: () => Promise<void>;
}) {
  const [busyAngle, setBusyAngle] = useState<PersonaAngle | null>(null);
  const [error, setError] = useState<string | null>(null);

  const replace = async (angle: PersonaAngle, file: File | undefined) => {
    if (!file) return;
    setBusyAngle(angle);
    setError(null);
    try {
      const dataUrl = await fileToDataUrl(file, PHOTO_IMPORT);
      const res = await fetch(`/api/personas/${encodeURIComponent(persona.id)}/photos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ angle, dataUrl }),
      });
      if (!res.ok) {
        setError(`Remplacement impossible (HTTP ${res.status}).`);
        return;
      }
      await onReplaced();
      onClose();
    } catch {
      setError("Remplacement impossible — vérifie l'image et ta connexion.");
    } finally {
      setBusyAngle(null);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Remplacer un angle</DialogTitle>
          <DialogDescription>Choisis l&apos;angle de « {persona.label} » à remplacer, puis sa nouvelle photo.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-2">
          {PERSONA_ANGLES.map((angle) => (
            <label key={angle} className="group flex cursor-pointer flex-col gap-1.5">
              <span className="flex aspect-square items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-border bg-muted/40 transition-colors group-hover:border-primary">
                {persona.angles.includes(angle) ? (
                  <img
                    src={`${personaImageUrl(persona.id, angle)}&v=${photoVersion}`}
                    alt={PERSONA_ANGLE_LABELS[angle]}
                    className="size-full object-cover"
                  />
                ) : (
                  <ImagePlus className="size-5 text-muted-foreground" />
                )}
              </span>
              <span className="text-center text-xs text-muted-foreground">
                {busyAngle === angle ? "Envoi…" : PERSONA_ANGLE_LABELS[angle]}
              </span>
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                disabled={busyAngle !== null}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  void replace(angle, file);
                }}
              />
            </label>
          ))}
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Fermer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
