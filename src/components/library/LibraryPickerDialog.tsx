"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import LibrarySearchInput from "./LibrarySearchInput";
import YoutubeRegionSelect from "./YoutubeRegionSelect";
import { useYoutubeSearchRegion } from "./useYoutubeSearchRegion";
import { PICKER_TABS, type LibraryKind, type LibraryPick, type PickerTab } from "./picker-tabs";
import { DEFAULT_YOUTUBE_SEARCH_REGION, type YoutubeSearchRegion } from "@/lib/youtube/search-regions";

/** A library kind, or « all » (the chat): every kind behind a top-level switcher. */
export type LibraryPickerKind = LibraryKind | "all";

const KINDS: { kind: LibraryKind; label: string }[] = [
  { kind: "personnages", label: "Personnages" },
  { kind: "logos", label: "Logos" },
  { kind: "inspirations", label: "Inspirations" },
];

const COPY: Record<LibraryPickerKind, { title: string; description: string }> = {
  personnages: { title: "Choisir un personnage", description: "Un personnage de ta bibliothèque." },
  logos: {
    title: "Choisir un logo",
    description: "Un logo de ta bibliothèque, ou cherche-le en ligne : il sera ajouté à ta bibliothèque.",
  },
  inspirations: {
    title: "Choisir une image de référence",
    description: "Une image de ta bibliothèque, une chaîne suivie, ou une miniature YouTube.",
  },
  all: { title: "Choisir dans la bibliothèque", description: "Un personnage, un logo ou une image de ta bibliothèque." },
};

export const PICK_REFUSED_ERROR = "Cette image ne peut pas être utilisée ici.";

/**
 * Runs a caller's onPick: null when accepted (the dialog closes), else the error
 * to show in the dialog (onPick returned false or threw).
 */
export function runLibraryPick(onPick: (item: LibraryPick) => boolean | void, item: LibraryPick): string | null {
  try {
    return onPick(item) === false ? PICK_REFUSED_ERROR : null;
  } catch (error) {
    return error instanceof Error && error.message ? error.message : PICK_REFUSED_ERROR;
  }
}

export function PickErrorLine({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="text-sm text-destructive">
      {error}
    </p>
  );
}

export function youtubePickerTabActive(
  kind: LibraryPickerKind,
  activeKind: LibraryKind | null,
  tabByKind: Partial<Record<LibraryKind, string>>,
): boolean {
  const current = kind === "all" ? activeKind : kind;
  return current === "inspirations" && tabByKind.inspirations === "youtube";
}

/** Search field, plus the country select when the YouTube source tab is open. */
export function LibraryPickerQueryRow({
  query,
  onQueryChange,
  region,
  onRegionChange,
  showRegion,
}: {
  query: string;
  onQueryChange: (query: string) => void;
  region: YoutubeSearchRegion;
  onRegionChange: (region: YoutubeSearchRegion) => void;
  showRegion: boolean;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <LibrarySearchInput
        className="min-w-0 flex-1"
        value={query}
        onChange={onQueryChange}
        placeholder="Rechercher"
        label="Rechercher dans la bibliothèque"
      />
      {showRegion ? <YoutubeRegionSelect value={region} onChange={onRegionChange} /> : null}
    </div>
  );
}

function KindTabs({
  tabs,
  query,
  onPick,
  region,
  tabId,
  onTabChange,
  nested,
}: {
  tabs: PickerTab[];
  query: string;
  onPick: (item: LibraryPick) => void;
  region: YoutubeSearchRegion;
  tabId: string | undefined;
  onTabChange: (tabId: string) => void;
  nested: boolean;
}) {
  // Inside the kind switcher, a kind with one tab (Personnages) needs no second tab row.
  if (nested && tabs.length === 1) {
    return <div className="min-h-0 flex-1 overflow-y-auto pr-1">{tabs[0].render({ query, onPick, region })}</div>;
  }
  const activeTab = tabs.find((tab) => tab.id === tabId)?.id ?? tabs[0]?.id;
  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) => {
        if (typeof value === "string") onTabChange(value);
      }}
      className="min-h-0 flex-1"
    >
      <TabsList variant={nested ? "line" : "default"} aria-label="Source">
        {tabs.map((tab) => (
          <TabsTrigger key={tab.id} value={tab.id}>
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((tab) => (
        <TabsContent key={tab.id} value={tab.id} className="min-h-0 overflow-y-auto pr-1">
          {tab.render({ query, onPick, region })}
        </TabsContent>
      ))}
    </Tabs>
  );
}

/** The dialog's tabs, state held by the caller (exported for render tests). */
export function LibraryPickerTabs({
  kind,
  query,
  onPick,
  region = DEFAULT_YOUTUBE_SEARCH_REGION,
  tabByKind,
  onTabChange,
  activeKind,
  onKindChange,
}: {
  kind: LibraryPickerKind;
  query: string;
  onPick: (item: LibraryPick) => void;
  region?: YoutubeSearchRegion;
  tabByKind: Partial<Record<LibraryKind, string>>;
  onTabChange: (kind: LibraryKind, tabId: string) => void;
  activeKind: LibraryKind | null;
  onKindChange: (kind: LibraryKind) => void;
}) {
  if (kind !== "all") {
    return (
      <KindTabs
        tabs={PICKER_TABS[kind]}
        query={query}
        onPick={onPick}
        region={region}
        tabId={tabByKind[kind]}
        onTabChange={(tabId) => onTabChange(kind, tabId)}
        nested={false}
      />
    );
  }
  return (
    <Tabs
      value={activeKind ?? KINDS[0].kind}
      onValueChange={(value) => {
        const next = KINDS.find((entry) => entry.kind === value);
        if (next) onKindChange(next.kind);
      }}
      className="min-h-0 flex-1"
    >
      <TabsList className="w-full" aria-label="Type d'élément">
        {KINDS.map((entry) => (
          <TabsTrigger key={entry.kind} value={entry.kind}>
            {entry.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {KINDS.map((entry) => (
        <TabsContent key={entry.kind} value={entry.kind} className="flex min-h-0 flex-col gap-2">
          <KindTabs
            tabs={PICKER_TABS[entry.kind]}
            query={query}
            onPick={onPick}
            region={region}
            tabId={tabByKind[entry.kind]}
            onTabChange={(tabId) => onTabChange(entry.kind, tabId)}
            nested
          />
        </TabsContent>
      ))}
    </Tabs>
  );
}

export default function LibraryPickerDialog({
  open,
  onOpenChange,
  kind,
  initialKind,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: LibraryPickerKind;
  /** « all » only: the kind shown first (e.g. the agent asked for a logo). */
  initialKind?: LibraryKind;
  /** Return false (or throw an Error with a message) to refuse the pick: the dialog stays open and shows why. */
  onPick: (item: LibraryPick) => boolean | void;
}) {
  const [query, setQuery] = useState("");
  const [tabByKind, setTabByKind] = useState<Partial<Record<LibraryKind, string>>>({});
  const [activeKind, setActiveKind] = useState<LibraryKind | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  const [region, setRegion] = useYoutubeSearchRegion();

  const changeOpen = (next: boolean) => {
    if (!next) {
      setQuery("");
      setTabByKind({});
      setActiveKind(null);
      setPickError(null);
    }
    onOpenChange(next);
  };

  const pick = (item: LibraryPick) => {
    const error = runLibraryPick(onPick, item);
    setPickError(error);
    if (error === null) changeOpen(false);
  };

  return (
    // The dialog's content is a portal, but React still bubbles its events
    // through this React tree (not the DOM tree) up to React Flow's node
    // wrapper: an unguarded right-click in here would open the canvas's
    // node context menu over the modal, so every caller of this dialog
    // gets that guard here rather than repeating it at each call site.
    // Backspace/Delete on the search input or a grid/result button in here
    // doesn't delete the node either, but for an unrelated reason: React
    // Flow's delete-key listener skips any input/textarea/contenteditable
    // target outright, and (via the same internal check) anything under a
    // `.nokey` ancestor too — which `DialogContent` below sets. `nokey`
    // itself is a plain CSS class with no key-handling of its own; React
    // Flow also happens to read it in an unrelated place, its pane
    // pointer-down capture (for starting a box selection), which doesn't
    // apply inside a dialog anyway.
    <div onContextMenu={(event) => event.stopPropagation()}>
      <Dialog open={open} onOpenChange={changeOpen}>
        <DialogContent className="nokey flex max-h-[85vh] flex-col gap-4 sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{COPY[kind].title}</DialogTitle>
            <DialogDescription>{COPY[kind].description}</DialogDescription>
          </DialogHeader>
          <LibraryPickerQueryRow
            query={query}
            onQueryChange={setQuery}
            region={region}
            onRegionChange={setRegion}
            showRegion={youtubePickerTabActive(kind, activeKind ?? initialKind ?? null, tabByKind)}
          />
          <PickErrorLine error={pickError} />
          <LibraryPickerTabs
            kind={kind}
            query={query}
            onPick={pick}
            region={region}
            tabByKind={tabByKind}
            onTabChange={(tabKind, tabId) => setTabByKind((current) => ({ ...current, [tabKind]: tabId }))}
            activeKind={activeKind ?? initialKind ?? null}
            onKindChange={setActiveKind}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
