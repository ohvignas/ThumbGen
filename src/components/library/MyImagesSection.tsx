"use client";

/* eslint-disable @next/next/no-img-element */

import { useRef, useState } from "react";
import { ImagePlus, Pencil, Trash2, Upload } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import ConfirmDialog from "@/components/settings/ConfirmDialog";
import { PHOTO_IMPORT, fileToDataUrl } from "@/lib/library/image-file";
import { fileBaseName, filterBySearch, swipeImageUrl, type LibrarySwipe } from "@/lib/library/library-items";
import ItemActionsMenu from "./ItemActionsMenu";
import { LibraryGrid, LibraryGridSkeleton } from "./LibraryGrid";
import LibrarySearchInput from "./LibrarySearchInput";
import RenameDialog from "./RenameDialog";
import { useLibraryList } from "./useLibraryList";

export default function MyImagesSection() {
  const { items, error: loadError, reload } = useLibraryList<LibrarySwipe>("/api/swipe-files");
  const [query, setQuery] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<LibrarySwipe | null>(null);
  const [deleting, setDeleting] = useState<LibrarySwipe | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const visible = items ? filterBySearch(items, (image) => image.title, query) : null;

  const importFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setUploading(true);
    setError(null);
    let failed = 0;
    for (const file of files) {
      try {
        const dataUrl = await fileToDataUrl(file, PHOTO_IMPORT);
        const res = await fetch("/api/swipe-files", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dataUrl, title: fileBaseName(file.name) }),
        });
        if (!res.ok) failed += 1;
      } catch {
        failed += 1;
      }
    }
    setUploading(false);
    if (failed > 0) setError(failed === 1 ? "Une image n'a pas pu être importée." : `${failed} images n'ont pas pu être importées.`);
    await reload();
  };

  const rename = async (image: LibrarySwipe, title: string): Promise<string | null> => {
    const res = await fetch("/api/swipe-files/rename", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: image.filename, title }),
    }).catch(() => null);
    if (!res?.ok) return "Renommage impossible — réessaie.";
    await reload();
    return null;
  };

  const remove = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      const res = await fetch(`/api/swipe-files?filename=${encodeURIComponent(deleting.filename)}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await reload();
    } catch {
      setError("Suppression impossible — réessaie.");
    } finally {
      setDeleting(null);
      setDeleteBusy(false);
    }
  };

  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-heading text-lg font-medium">Mes images</h2>
          <p className="text-sm text-muted-foreground">Miniatures et visuels importés, à utiliser comme images de référence.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LibrarySearchInput value={query} onChange={setQuery} placeholder="Rechercher une image" label="Rechercher une image" className="w-64" />
          <Button onClick={() => inputRef.current?.click()} disabled={uploading}>
            <Upload />
            {uploading ? "Import…" : "Importer des images"}
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              event.target.value = "";
              void importFiles(files);
            }}
          />
        </div>
      </div>

      {(error || loadError) && (
        <Alert variant="destructive">
          <AlertDescription>{error ?? loadError}</AlertDescription>
        </Alert>
      )}

      {visible === null && <LibraryGridSkeleton />}

      {items?.length === 0 && (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ImagePlus />
            </EmptyMedia>
            <EmptyTitle>Aucune image importée</EmptyTitle>
            <EmptyDescription>Importe des miniatures qui t&apos;inspirent pour t&apos;en servir comme références.</EmptyDescription>
          </EmptyHeader>
          <Button onClick={() => inputRef.current?.click()} disabled={uploading}>
            <Upload />
            Importer des images
          </Button>
        </Empty>
      )}

      {items && items.length > 0 && visible?.length === 0 && (
        <p className="text-sm text-muted-foreground">Aucune image ne correspond à « {query.trim()} ».</p>
      )}

      {visible && visible.length > 0 && (
        <LibraryGrid>
          {visible.map((image) => (
            <Card key={image.filename} size="sm" className="gap-2 pt-0">
              <img
                src={swipeImageUrl(image.filename)}
                alt={image.title}
                loading="lazy"
                className="aspect-video w-full bg-muted object-cover"
              />
              <CardHeader>
                <CardTitle className="truncate text-sm" title={image.title}>
                  {image.title}
                </CardTitle>
                <CardAction>
                  <ItemActionsMenu
                    itemLabel={image.title}
                    actions={[
                      { label: "Renommer", icon: Pencil, onClick: () => setRenaming(image) },
                      { label: "Supprimer", icon: Trash2, onClick: () => setDeleting(image), destructive: true },
                    ]}
                  />
                </CardAction>
              </CardHeader>
            </Card>
          ))}
        </LibraryGrid>
      )}

      {renaming && (
        <RenameDialog
          key={renaming.filename}
          open
          onOpenChange={(open) => {
            if (!open) setRenaming(null);
          }}
          title="Renommer l'image"
          description="Le nom sert à la retrouver dans la bibliothèque et dans les nœuds."
          initialValue={renaming.title}
          maxLength={200}
          onSubmit={(title) => rename(renaming, title)}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title={`Supprimer « ${deleting?.title ?? ""} » ?`}
        description="L'image est effacée de la bibliothèque. Les nœuds qui l'utilisent afficheront leur état vide."
        confirmLabel="Supprimer"
        busy={deleteBusy}
        onConfirm={() => void remove()}
      />
    </section>
  );
}
