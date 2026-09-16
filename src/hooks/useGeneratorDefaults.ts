"use client";

import { useEffect, useState } from "react";
import {
  FALLBACK_GENERATOR_DEFAULTS,
  generatorDefaultsFromSettings,
  type GeneratorDefaults,
} from "@/lib/generator-defaults";
import type { SettingsResponse } from "@/lib/settings-schema";

/** Data for generator nodes created from the canvas UI, from the Génération settings. */
export function useGeneratorDefaults(): GeneratorDefaults {
  const [defaults, setDefaults] = useState<GeneratorDefaults>(FALLBACK_GENERATOR_DEFAULTS);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings")
      .then((res) => (res.ok ? (res.json() as Promise<SettingsResponse>) : null))
      .then((settings) => {
        if (settings && !cancelled) setDefaults(generatorDefaultsFromSettings(settings));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return defaults;
}
