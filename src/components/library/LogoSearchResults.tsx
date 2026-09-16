"use client";

import { useState } from "react";
import { Check, Plus } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import {
  LOGO_SOURCE_LABELS,
  LOGO_VARIANT_LABELS,
  searchEmptyMessage,
  unavailableNotice,
  type AddedLogo,
  type LogoSearchResult,
} from "@/lib/logos/shared";
import { LibraryGrid, LibraryGridSkeleton } from "./LibraryGrid";
import LogoPreview from "./LogoPreview";
import { useLogoSearch } from "./useLogoSearch";

/** https://brandfetch.com/<domain>, or the homepage when the result carries no domain. */
function brandfetchUrl(detail: string | null): string {
  return detail ? `https://brandfetch.com/${detail}` : "https://brandfetch.com/";
}

/**
 * Merged online results; « Ajouter » saves one in the library (PNG). Brandfetch's
 * guidelines forbid storing or programmatically fetching their images, so a
 * Brandfetch card links out to Brandfetch instead of an « Ajouter » button.
 */
export default function LogoSearchResults({
  query,
  onAdded,
  compact = false,
}: {
  query: string;
  onAdded: (logo: AddedLogo) => void;
  compact?: boolean;
}) {
  const search = useLogoSearch(query);
  const [adding, setAdding] = useState<string | null>(null);
  const [added, setAdded] = useState<Record<string, AddedLogo>>({});
  const [error, setError] = useState<string | null>(null);

  const add = async (result: LogoSearchResult) => {
    setAdding(result.key);
    setError(null);
    try {
      const res = await fetch("/api/logos/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: result.source, ref: result.ref, name: result.name }),
      });
      const body = (await res.json().catch(() => ({}))) as Partial<AddedLogo> & { error?: string };
      if (!res.ok || typeof body.filename !== "string") {
        setError(body.error ?? `Ajout impossible (HTTP ${res.status}).`);
        return;
      }
      const logo: AddedLogo = { filename: body.filename, label: body.label ?? result.name, remote: Boolean(body.remote) };
      setAdded((previous) => ({ ...previous, [result.key]: logo }));
      onAdded(logo);
    } catch {
      setError("Ajout impossible — vérifie ta connexion.");
    } finally {
      setAdding(null);
    }
  };

  const gridClass = compact ? "sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-3" : undefined;

  if (search.status === "idle") {
    return <p className="text-sm text-muted-foreground">Tape au moins 2 caractères pour chercher un logo en ligne.</p>;
  }
  if (search.status === "loading") return <LibraryGridSkeleton count={compact ? 3 : 4} aspect="aspect-[4/3]" />;
  if (search.status === "error") {
    return (
      <Alert variant="destructive">
        <AlertDescription>{search.message}</AlertDescription>
      </Alert>
    );
  }

  const { response } = search;
  const notice = unavailableNotice(response.unavailable);
  const empty = searchEmptyMessage(response, query.trim());

  return (
    <div className="grid gap-3">
      {notice && !empty && <p className="text-xs text-muted-foreground">{notice}</p>}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {empty ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <LibraryGrid className={gridClass}>
          {response.results.map((result) => {
            const done = added[result.key];
            const isBrandfetch = result.source === "brandfetch";
            return (
              <Card key={result.key} size="sm" className="gap-2 pt-0">
                <LogoPreview src={result.previewUrl} alt={result.name} />
                <CardContent className="grid gap-1.5">
                  <p className="truncate text-sm font-medium" title={result.name}>
                    {result.name}
                  </p>
                  {result.detail && <p className="truncate text-xs text-muted-foreground">{result.detail}</p>}
                  <div className="flex flex-wrap gap-1">
                    <Badge variant="outline">{LOGO_SOURCE_LABELS[result.source]}</Badge>
                    {result.variant && <Badge variant="secondary">{LOGO_VARIANT_LABELS[result.variant]}</Badge>}
                  </div>
                </CardContent>
                {isBrandfetch ? (
                  <CardFooter className="flex-col items-stretch gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full"
                      render={<a href={brandfetchUrl(result.detail)} target="_blank" rel="noopener noreferrer" />}
                    >
                      Voir sur Brandfetch
                    </Button>
                    <p className="text-xs text-muted-foreground">Télécharge le logo sur Brandfetch puis importe-le.</p>
                  </CardFooter>
                ) : (
                  <CardFooter>
                    <Button
                      size="sm"
                      variant={done ? "secondary" : "default"}
                      className="w-full"
                      disabled={Boolean(done) || adding !== null}
                      onClick={() => void add(result)}
                    >
                      {done ? <Check /> : <Plus />}
                      {done ? "Ajouté" : adding === result.key ? "Ajout…" : "Ajouter"}
                    </Button>
                  </CardFooter>
                )}
              </Card>
            );
          })}
        </LibraryGrid>
      )}
    </div>
  );
}
