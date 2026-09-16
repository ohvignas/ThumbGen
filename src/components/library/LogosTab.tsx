"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { LOGO_IMPORT, fileToDataUrl } from "@/lib/library/image-file";
import { fileBaseName, type LibraryLogo } from "@/lib/library/library-items";
import { LOGO_SEARCH_MIN_CHARS } from "@/lib/logos/shared";
import LibrarySearchInput from "./LibrarySearchInput";
import LogoSearchResults from "./LogoSearchResults";
import MyLogosSection from "./MyLogosSection";
import { useLibraryList } from "./useLibraryList";

export default function LogosTab() {
  const { items, error: loadError, reload } = useLibraryList<LibraryLogo>("/api/logos");
  // One field: online search (≥ 2 characters) and filter of « Mes logos ».
  const [query, setQuery] = useState("");
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const searching = query.trim().length >= LOGO_SEARCH_MIN_CHARS;

  const importFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setImporting(true);
    setImportError(null);
    let failed = 0;
    for (const file of files) {
      try {
        const dataUrl = await fileToDataUrl(file, LOGO_IMPORT);
        const res = await fetch("/api/logos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dataUrl, label: fileBaseName(file.name) }),
        });
        if (!res.ok) failed += 1;
      } catch {
        failed += 1;
      }
    }
    setImporting(false);
    if (failed > 0) setImportError(failed === 1 ? "Un logo n'a pas pu être importé." : `${failed} logos n'ont pas pu être importés.`);
    await reload();
  };

  return (
    <div className="grid gap-8">
      <div className="flex flex-wrap items-center gap-2">
        <LibrarySearchInput
          value={query}
          onChange={setQuery}
          placeholder="Chercher un logo (ex. notion, youtube)"
          label="Chercher un logo"
          className="max-w-md flex-1"
        />
        <Button variant="outline" onClick={() => inputRef.current?.click()} disabled={importing}>
          <Upload />
          {importing ? "Import…" : "Importer une image"}
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

      {importError && (
        <Alert variant="destructive">
          <AlertDescription>{importError}</AlertDescription>
        </Alert>
      )}

      {searching && (
        <section className="grid gap-3">
          <h2 className="font-heading text-lg font-medium">Résultats en ligne</h2>
          <LogoSearchResults query={query} onAdded={() => void reload()} />
        </section>
      )}

      <MyLogosSection logos={items} loadError={loadError} query={query} onChanged={reload} onImport={() => inputRef.current?.click()} />
    </div>
  );
}
