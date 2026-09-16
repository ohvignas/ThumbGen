"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import LibrarySearchInput from "./LibrarySearchInput";
import { PICKER_TABS, type LibraryKind, type LibraryPick } from "./picker-tabs";

const COPY: Record<LibraryKind, { title: string; description: string }> = {
  personnages: { title: "Choisir un personnage", description: "Un personnage de ta bibliothèque." },
  logos: {
    title: "Choisir un logo",
    description: "Un logo de ta bibliothèque, ou cherche-le en ligne : il sera ajouté à ta bibliothèque.",
  },
  inspirations: { title: "Choisir une image de référence", description: "Une image de ta bibliothèque." },
};

export default function LibraryPickerDialog({
  open,
  onOpenChange,
  kind,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: LibraryKind;
  onPick: (item: LibraryPick) => void;
}) {
  const tabs = PICKER_TABS[kind];
  const [query, setQuery] = useState("");
  const [tabId, setTabId] = useState<string | null>(null);
  const activeTab = tabs.find((tab) => tab.id === tabId)?.id ?? tabs[0]?.id;

  const changeOpen = (next: boolean) => {
    if (!next) {
      setQuery("");
      setTabId(null);
    }
    onOpenChange(next);
  };

  const pick = (item: LibraryPick) => {
    onPick(item);
    changeOpen(false);
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
          <LibrarySearchInput value={query} onChange={setQuery} placeholder="Rechercher" label="Rechercher dans la bibliothèque" />
          <Tabs
            value={activeTab}
            onValueChange={(value) => {
              if (typeof value === "string") setTabId(value);
            }}
            className="min-h-0 flex-1"
          >
            <TabsList>
              {tabs.map((tab) => (
                <TabsTrigger key={tab.id} value={tab.id}>
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
            {tabs.map((tab) => (
              <TabsContent key={tab.id} value={tab.id} className="min-h-0 overflow-y-auto pr-1">
                {tab.render({ query, onPick: pick })}
              </TabsContent>
            ))}
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
}
