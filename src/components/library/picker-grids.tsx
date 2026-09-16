"use client";

/* eslint-disable @next/next/no-img-element */

import { cn } from "cn";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { filterBySearch, logoImageUrl, swipeImageUrl, type LibraryLogo, type LibrarySwipe } from "@/lib/library/library-items";
import { personaImageUrl, type PersonaSummary } from "@/lib/personas";
import LogoPreview from "./LogoPreview";
import LogoSearchResults from "./LogoSearchResults";
import type { LibraryPick } from "./picker-tabs";
import { useLibraryList } from "./useLibraryList";

type PickerGridProps = { query: string; onPick: (item: LibraryPick) => void };
type PickerItem = { key: string; imageUrl: string; label: string };

function PickerItemsGrid({
  items,
  error,
  query,
  emptyLabel,
  aspect,
  logo = false,
  onPick,
}: {
  items: PickerItem[] | null;
  error: string | null;
  query: string;
  emptyLabel: string;
  aspect: string;
  logo?: boolean;
  onPick: (item: LibraryPick) => void;
}) {
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }
  if (items === null) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className={cn("w-full rounded-lg", aspect)} />
        ))}
      </div>
    );
  }
  const visible = filterBySearch(items, (item) => item.label, query);
  if (visible.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        {items.length === 0 ? emptyLabel : `Aucun résultat pour « ${query.trim()} ».`}
      </p>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {visible.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => onPick({ imageUrl: item.imageUrl, label: item.label })}
          className="overflow-hidden rounded-lg border text-left transition-colors hover:border-ring focus-visible:border-ring focus-visible:outline-none"
        >
          {logo ? (
            <LogoPreview src={item.imageUrl} alt={item.label} />
          ) : (
            <img src={item.imageUrl} alt={item.label} loading="lazy" className={cn("w-full bg-muted object-cover", aspect)} />
          )}
          <span className="block truncate px-2 py-1.5 text-xs">{item.label}</span>
        </button>
      ))}
    </div>
  );
}

export function PersonaPickerGrid({ query, onPick }: PickerGridProps) {
  const { items, error } = useLibraryList<PersonaSummary>("/api/personas");
  const pickerItems =
    items === null
      ? null
      : items.flatMap((persona) =>
          persona.angles[0]
            ? [{ key: persona.id, imageUrl: personaImageUrl(persona.id, persona.angles[0]), label: persona.label || "Personnage" }]
            : [],
        );
  return (
    <PickerItemsGrid
      items={pickerItems}
      error={error}
      query={query}
      emptyLabel="Aucun personnage dans ta bibliothèque."
      aspect="aspect-square"
      onPick={onPick}
    />
  );
}

export function LogoPickerGrid({ query, onPick }: PickerGridProps) {
  const { items, error } = useLibraryList<LibraryLogo>("/api/logos");
  const pickerItems =
    items === null ? null : items.map((logo) => ({ key: logo.filename, imageUrl: logoImageUrl(logo.filename), label: logo.label }));
  return (
    <PickerItemsGrid
      items={pickerItems}
      error={error}
      query={query}
      emptyLabel="Aucun logo enregistré — cherche-le dans l'onglet « Chercher en ligne »."
      aspect="aspect-[4/3]"
      logo
      onPick={onPick}
    />
  );
}

export function SwipePickerGrid({ query, onPick }: PickerGridProps) {
  const { items, error } = useLibraryList<LibrarySwipe>("/api/swipe-files");
  const pickerItems =
    items === null ? null : items.map((image) => ({ key: image.filename, imageUrl: swipeImageUrl(image.filename), label: image.title }));
  return (
    <PickerItemsGrid
      items={pickerItems}
      error={error}
      query={query}
      emptyLabel="Aucune image importée — ajoute-en depuis la page Bibliothèque."
      aspect="aspect-video"
      onPick={onPick}
    />
  );
}

/** « Chercher en ligne »: the result is added to the library, then placed in the node. */
export function LogoSearchPicker({ query, onPick }: PickerGridProps) {
  return (
    <LogoSearchResults
      query={query}
      compact
      onAdded={(logo) => onPick({ imageUrl: logoImageUrl(logo.filename), label: logo.label })}
    />
  );
}
