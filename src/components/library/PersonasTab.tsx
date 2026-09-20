"use client";

/* eslint-disable @next/next/no-img-element */

import { useState } from "react";
import { Camera, Eraser, ImagePlus, Pencil, Plus, Trash2, Upload, Users } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import PersonaImportDialog from "@/components/panels/PersonaImportDialog";
import WebcamCaptureModal from "@/components/panels/WebcamCaptureModal";
import ConfirmDialog from "@/components/settings/ConfirmDialog";
import { PHOTO_IMPORT, fileToDataUrl } from "@/lib/library/image-file";
import { filterBySearch } from "@/lib/library/library-items";
import { PERSONA_ANGLES, PERSONA_ANGLE_LABELS, personaImageUrl, type PersonaAngle, type PersonaSummary } from "@/lib/personas";
import { REMOVE_BG_LABEL, REMOVING_BG_LABEL } from "@/lib/remove-bg";
import ItemActionsMenu from "./ItemActionsMenu";
import { LibraryGrid, LibraryGridSkeleton } from "./LibraryGrid";
import LibrarySearchInput from "./LibrarySearchInput";
import RenameDialog from "./RenameDialog";
import ReplaceAngleDialog from "./ReplaceAngleDialog";
import { useLibraryList } from "./useLibraryList";

type CreationStep = "choice" | "webcam" | "import";

export default function PersonasTab() {
  const { items, error: loadError, reload } = useLibraryList<PersonaSummary>("/api/personas");
  const [query, setQuery] = useState("");
  const [creation, setCreation] = useState<CreationStep | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<PersonaSummary | null>(null);
  const [replacing, setReplacing] = useState<PersonaSummary | null>(null);
  const [deleting, setDeleting] = useState<PersonaSummary | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [strippingId, setStrippingId] = useState<string | null>(null);
  // Appended to image URLs: a replaced angle keeps the same URL (60 s browser cache).
  const [photoVersion, setPhotoVersion] = useState(0);

  const visible = items ? filterBySearch(items, (persona) => persona.label, query) : null;

  // Webcam wizard (3 angles + name) and per-angle import (front required) share this.
  const savePersona = async (photos: Partial<Record<PersonaAngle, string>>, name: string) => {
    setSaving(true);
    setError(null);
    try {
      const { stripPhotoBackgrounds } = await import("@/lib/remove-bg");
      let ready = photos;
      try {
        ready = await stripPhotoBackgrounds(photos, PERSONA_ANGLES);
      } catch {
        setError("Impossible de retirer le fond — réessaie.");
        return;
      }
      const res = await fetch("/api/personas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: name || `Personnage ${(items?.length ?? 0) + 1}`, photos: ready }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Échec de l'enregistrement du personnage — réessaie.");
        setCreation(null);
        return;
      }
      setCreation(null);
      await reload();
    } catch {
      setError("Échec de l'enregistrement du personnage — vérifie ta connexion et réessaie.");
      setCreation(null);
    } finally {
      setSaving(false);
    }
  };

  const rename = async (persona: PersonaSummary, label: string): Promise<string | null> => {
    const res = await fetch(`/api/personas/${encodeURIComponent(persona.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label }),
    }).catch(() => null);
    if (!res?.ok) return "Renommage impossible — réessaie.";
    await reload();
    return null;
  };

  const remove = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/personas/${encodeURIComponent(deleting.id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setDeleting(null);
      await reload();
    } catch {
      setError("Suppression impossible — réessaie.");
      setDeleting(null);
    } finally {
      setDeleteBusy(false);
    }
  };

  const stripExisting = async (persona: PersonaSummary) => {
    if (strippingId) return;
    setStrippingId(persona.id);
    setError(null);
    try {
      const { removeBackgroundFromSrc } = await import("@/lib/remove-bg");
      for (const angle of persona.angles) {
        const cutout = await removeBackgroundFromSrc(`${personaImageUrl(persona.id, angle)}&v=${photoVersion}`);
        const res = await fetch(`/api/personas/${encodeURIComponent(persona.id)}/photos`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ angle, dataUrl: cutout }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      }
      setPhotoVersion((version) => version + 1);
      await reload();
    } catch {
      setError("Impossible de retirer le fond — réessaie.");
    } finally {
      setStrippingId(null);
    }
  };

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <LibrarySearchInput
          value={query}
          onChange={setQuery}
          placeholder="Rechercher un personnage"
          label="Rechercher un personnage"
          className="max-w-sm flex-1"
        />
        <Button onClick={() => setCreation("choice")} disabled={saving}>
          <Plus />
          {saving ? "Enregistrement…" : "Nouveau personnage"}
        </Button>
      </div>

      {(error || loadError) && (
        <Alert variant="destructive">
          <AlertDescription>{error ?? loadError}</AlertDescription>
        </Alert>
      )}

      {visible === null && <LibraryGridSkeleton aspect="aspect-[3/1]" />}

      {items?.length === 0 && (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Users />
            </EmptyMedia>
            <EmptyTitle>Aucun personnage</EmptyTitle>
            <EmptyDescription>
              Crée ton personnage (ton visage sous trois angles) pour des miniatures qui te ressemblent.
            </EmptyDescription>
          </EmptyHeader>
          <Button onClick={() => setCreation("choice")}>
            <Plus />
            Nouveau personnage
          </Button>
        </Empty>
      )}

      {items && items.length > 0 && visible?.length === 0 && (
        <p className="text-sm text-muted-foreground">Aucun personnage ne correspond à « {query.trim()} ».</p>
      )}

      {visible && visible.length > 0 && (
        <LibraryGrid>
          {visible.map((persona) => (
            <Card key={persona.id} className="gap-3 pt-0">
              <div className="grid grid-cols-3 gap-px bg-border">
                {PERSONA_ANGLES.map((angle) =>
                  persona.angles.includes(angle) ? (
                    <img
                      key={angle}
                      src={`${personaImageUrl(persona.id, angle)}&v=${photoVersion}`}
                      alt={`${persona.label} — ${PERSONA_ANGLE_LABELS[angle]}`}
                      loading="lazy"
                      className="aspect-square w-full bg-muted object-cover"
                    />
                  ) : (
                    <div
                      key={angle}
                      title={PERSONA_ANGLE_LABELS[angle]}
                      className="flex aspect-square w-full items-center justify-center bg-muted text-sm text-muted-foreground"
                    >
                      —
                    </div>
                  ),
                )}
              </div>
              <CardHeader>
                <CardTitle className="truncate" title={persona.label}>
                  {persona.label}
                </CardTitle>
                <CardAction className="flex items-center gap-1">
                  <Badge variant="secondary">{strippingId === persona.id ? "Fond…" : `${persona.angles.length}/3`}</Badge>
                  <ItemActionsMenu
                    itemLabel={persona.label}
                    actions={[
                      { label: "Renommer", icon: Pencil, onClick: () => setRenaming(persona) },
                      { label: "Remplacer un angle", icon: ImagePlus, onClick: () => setReplacing(persona) },
                      {
                        label: strippingId === persona.id ? REMOVING_BG_LABEL : REMOVE_BG_LABEL,
                        icon: Eraser,
                        onClick: () => void stripExisting(persona),
                      },
                      { label: "Supprimer", icon: Trash2, onClick: () => setDeleting(persona), destructive: true },
                    ]}
                  />
                </CardAction>
              </CardHeader>
            </Card>
          ))}
        </LibraryGrid>
      )}

      <Dialog open={creation === "choice"} onOpenChange={(open) => setCreation(open ? "choice" : null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Nouveau personnage</DialogTitle>
            <DialogDescription>
              Ton visage sous trois angles (face, profil gauche, profil droit) pour des miniatures qui te ressemblent.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Button variant="outline" className="justify-start" onClick={() => setCreation("webcam")}>
              <Camera />
              Capturer avec la webcam
            </Button>
            <Button variant="outline" className="justify-start" onClick={() => setCreation("import")}>
              <Upload />
              Importer une photo par angle
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {creation === "webcam" && <WebcamCaptureModal onClose={() => setCreation(null)} onComplete={savePersona} />}

      {creation === "import" && (
        <PersonaImportDialog
          onClose={() => setCreation(null)}
          prepareFile={(file) => fileToDataUrl(file, PHOTO_IMPORT)}
          onSubmit={savePersona}
          saving={saving}
        />
      )}

      {renaming && (
        <RenameDialog
          key={renaming.id}
          open
          onOpenChange={(open) => {
            if (!open) setRenaming(null);
          }}
          title="Renommer le personnage"
          description="Le nouveau nom apparaît dans la bibliothèque et dans les nœuds Personnage."
          initialValue={renaming.label}
          maxLength={100}
          onSubmit={(label) => rename(renaming, label)}
        />
      )}

      {replacing && (
        <ReplaceAngleDialog
          key={replacing.id}
          persona={replacing}
          photoVersion={photoVersion}
          onClose={() => setReplacing(null)}
          onReplaced={async () => {
            setPhotoVersion((version) => version + 1);
            await reload();
          }}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title={`Supprimer « ${deleting?.label ?? ""} » ?`}
        description="Ses photos sont effacées. Les miniatures qui l'utilisent afficheront un nœud Personnage vide."
        confirmLabel="Supprimer"
        busy={deleteBusy}
        onConfirm={() => void remove()}
      />
    </div>
  );
}
