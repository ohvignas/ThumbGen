"use client";

import { useState } from "react";
import { ImageOff, Pencil, Shapes, Trash2, Upload } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import ConfirmDialog from "@/components/settings/ConfirmDialog";
import { filterBySearch, logoImageUrl, type LibraryLogo } from "@/lib/library/library-items";
import ItemActionsMenu from "./ItemActionsMenu";
import { LibraryGrid, LibraryGridSkeleton } from "./LibraryGrid";
import LogoPreview from "./LogoPreview";
import RenameDialog from "./RenameDialog";

function LogoCard({ logo, onRename, onDelete }: { logo: LibraryLogo; onRename: () => void; onDelete: () => void }) {
  // A stored logo whose image fails to load (corrupt row, deleted file on disk, etc).
  const [unavailable, setUnavailable] = useState(false);
  return (
    <Card size="sm" className="gap-2 pt-0">
      {unavailable ? (
        <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 bg-muted p-4 text-center">
          <ImageOff className="size-5 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">Logo indisponible</p>
          <Button size="xs" variant="destructive" onClick={onDelete}>
            Supprimer
          </Button>
        </div>
      ) : (
        <LogoPreview src={logoImageUrl(logo.filename)} alt={logo.label} onError={() => setUnavailable(true)} />
      )}
      <CardHeader>
        <CardTitle className="truncate text-sm" title={logo.label}>
          {logo.label}
        </CardTitle>
        <CardAction className="flex items-center gap-1">
          <ItemActionsMenu
            itemLabel={logo.label}
            actions={[
              { label: "Renommer", icon: Pencil, onClick: onRename },
              { label: "Supprimer", icon: Trash2, onClick: onDelete, destructive: true },
            ]}
          />
        </CardAction>
      </CardHeader>
    </Card>
  );
}

export default function MyLogosSection({
  logos,
  loadError,
  query,
  onChanged,
  onImport,
}: {
  logos: LibraryLogo[] | null;
  loadError: string | null;
  query: string;
  onChanged: () => Promise<void>;
  onImport: () => void;
}) {
  const [renaming, setRenaming] = useState<LibraryLogo | null>(null);
  const [deleting, setDeleting] = useState<LibraryLogo | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const visible = logos ? filterBySearch(logos, (logo) => logo.label, query) : null;

  const rename = async (logo: LibraryLogo, label: string): Promise<string | null> => {
    const res = await fetch("/api/logos/rename", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: logo.filename, label }),
    }).catch(() => null);
    if (!res?.ok) return "Renommage impossible — réessaie.";
    await onChanged();
    return null;
  };

  const remove = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/logos?filename=${encodeURIComponent(deleting.filename)}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await onChanged();
    } catch {
      setError("Suppression impossible — réessaie.");
    } finally {
      setDeleting(null);
      setDeleteBusy(false);
    }
  };

  return (
    <section className="grid gap-3">
      <h2 className="font-heading text-lg font-medium">Mes logos</h2>

      {(error || loadError) && (
        <Alert variant="destructive">
          <AlertDescription>{error ?? loadError}</AlertDescription>
        </Alert>
      )}

      {visible === null && <LibraryGridSkeleton aspect="aspect-[4/3]" />}

      {logos?.length === 0 && (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Shapes />
            </EmptyMedia>
            <EmptyTitle>Aucun logo enregistré</EmptyTitle>
            <EmptyDescription>Cherche un logo ci-dessus et clique « Ajouter », ou importe une image.</EmptyDescription>
          </EmptyHeader>
          <Button variant="outline" onClick={onImport}>
            <Upload />
            Importer une image
          </Button>
        </Empty>
      )}

      {logos && logos.length > 0 && visible?.length === 0 && (
        <p className="text-sm text-muted-foreground">Aucun de tes logos ne correspond à « {query.trim()} ».</p>
      )}

      {visible && visible.length > 0 && (
        <LibraryGrid>
          {visible.map((logo) => (
            <LogoCard key={logo.filename} logo={logo} onRename={() => setRenaming(logo)} onDelete={() => setDeleting(logo)} />
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
          title="Renommer le logo"
          description="Le nom sert à le retrouver et indique au modèle quelle marque placer."
          initialValue={renaming.label}
          maxLength={100}
          onSubmit={(label) => rename(renaming, label)}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title={`Supprimer « ${deleting?.label ?? ""} » ?`}
        description="Le logo est retiré de la bibliothèque. Les nœuds Logo qui l'utilisent afficheront leur état vide."
        confirmLabel="Supprimer"
        busy={deleteBusy}
        onConfirm={() => void remove()}
      />
    </section>
  );
}
