"use client";

import { useCallback, useEffect, useState } from "react";
import type { SettingsResponse } from "@/lib/settings-schema";

/** Loads GET /api/settings once; `reload` refetches (e.g. after saving a key). */
export function useSettings() {
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const reload = useCallback(async (): Promise<SettingsResponse | null> => {
    try {
      const res = await fetch("/api/settings", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as SettingsResponse;
      setSettings(data);
      setLoadError(null);
      return data;
    } catch {
      setLoadError("Impossible de charger les réglages.");
      return null;
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { settings, loadError, reload };
}
