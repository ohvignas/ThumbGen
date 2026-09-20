"use client";

import { useState } from "react";
import { Eraser, ImagePlus } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PERSONA_ANGLES, PERSONA_ANGLE_LABELS, type PersonaAngle } from "@/lib/personas";
import { REMOVE_BG_LABEL, REMOVING_BG_LABEL } from "@/lib/remove-bg";

/* eslint-disable @next/next/no-img-element */

/**
 * « Nouveau personnage » without a webcam: one photo per angle. The front
 * photo is required; profiles are optional (the library shows n/3).
 */
export default function PersonaImportDialog({
  onClose,
  prepareFile,
  onSubmit,
  saving,
}: {
  onClose: () => void;
  prepareFile: (file: File) => Promise<string>;
  onSubmit: (photos: Partial<Record<PersonaAngle, string>>, name: string) => Promise<void>;
  saving: boolean;
}) {
  const [photos, setPhotos] = useState<Partial<Record<PersonaAngle, string>>>({});
  const [name, setName] = useState("");
  const [removingBg, setRemovingBg] = useState(false);
  const [bgError, setBgError] = useState<string | null>(null);
  const hasPhoto = PERSONA_ANGLES.some((angle) => photos[angle]);

  const pick = async (angle: PersonaAngle, file: File | undefined) => {
    if (!file) return;
    const dataUrl = await prepareFile(file);
    setBgError(null);
    setPhotos((previous) => ({ ...previous, [angle]: dataUrl }));
  };

  const stripBackgrounds = async () => {
    if (!hasPhoto || removingBg || saving) return;
    setRemovingBg(true);
    setBgError(null);
    try {
      const { stripPhotoBackgrounds } = await import("@/lib/remove-bg");
      setPhotos(await stripPhotoBackgrounds(photos, PERSONA_ANGLES));
    } catch {
      setBgError("Impossible de retirer le fond — réessaie.");
    } finally {
      setRemovingBg(false);
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
          <DialogTitle>Importer un personnage</DialogTitle>
          <DialogDescription>Une photo par angle. La face est obligatoire, les profils sont conseillés.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="persona-import-name">Nom</Label>
            <Input
              id="persona-import-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ex : Antoine, Moi, Perso vidéo…"
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            {PERSONA_ANGLES.map((angle) => (
              <label key={angle} className="group flex cursor-pointer flex-col gap-1.5">
                <span className="flex aspect-square items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-border bg-muted/40 transition-colors group-hover:border-primary">
                  {photos[angle] ? (
                    <img src={photos[angle]} alt={PERSONA_ANGLE_LABELS[angle]} className="size-full object-cover" />
                  ) : (
                    <ImagePlus className="size-5 text-muted-foreground" />
                  )}
                </span>
                <span className="text-center text-xs text-muted-foreground">
                  {PERSONA_ANGLE_LABELS[angle]}
                  {angle === "front" ? " *" : ""}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    void pick(angle, file);
                  }}
                />
              </label>
            ))}
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={!hasPhoto || removingBg || saving}
            onClick={() => void stripBackgrounds()}
          >
            <Eraser />
            {removingBg ? REMOVING_BG_LABEL : REMOVE_BG_LABEL}
          </Button>
          {bgError && <p className="text-sm text-destructive">{bgError}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button disabled={!photos.front || saving || removingBg} onClick={() => void onSubmit(photos, name.trim())}>
            {saving ? "Enregistrement…" : "Créer le personnage"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
