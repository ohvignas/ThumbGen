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
    <Dialog open={open} onOpenChange={changeOpen}>
      {/* nokey: React Flow's delete-key handler ignores Backspace pressed in here. */}
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
  );
}
