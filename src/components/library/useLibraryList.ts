"use client";

import { useCallback, useEffect, useState } from "react";

/** Loads a library list (JSON array). `items` stays null until the first answer. */
export function useLibraryList<T>(url: string): { items: T[] | null; error: string | null; reload: () => Promise<void> } {
  const [items, setItems] = useState<T[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as unknown;
      setItems(Array.isArray(body) ? (body as T[]) : []);
      setError(null);
    } catch {
      setItems((previous) => previous ?? []);
      setError("Chargement impossible — vérifie ta connexion et réessaie.");
    }
  }, [url]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { items, error, reload };
}
