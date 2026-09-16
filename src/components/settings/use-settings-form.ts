"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SettingsIssue, SettingsValues } from "@/lib/settings-schema";
import { isDirty, issuesByPath, pickValues } from "./form-state";
import { useSettings } from "./use-settings";

export type SettingsForm<K extends keyof SettingsValues> = {
  values: Pick<SettingsValues, K> | null;
  setValue: <F extends K>(key: F, value: SettingsValues[F]) => void;
  dirty: boolean;
  saving: boolean;
  saved: boolean;
  issues: Record<string, string>;
  error: string | null;
  loadError: string | null;
  save: () => Promise<void>;
};

/**
 * Loads the given setting keys, tracks edits against the loaded values and
 * POSTs only those keys. Pass a module-level constant as `keys`.
 */
export function useSettingsForm<K extends keyof SettingsValues>(
  keys: readonly K[],
  options: { onSaved?: (values: Pick<SettingsValues, K>) => void } = {},
): SettingsForm<K> {
  const { settings, loadError } = useSettings();
  const [initial, setInitial] = useState<Pick<SettingsValues, K> | null>(null);
  const [values, setValues] = useState<Pick<SettingsValues, K> | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [issues, setIssues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const onSavedRef = useRef(options.onSaved);

  useEffect(() => {
    onSavedRef.current = options.onSaved;
  });

  useEffect(() => {
    if (!settings || initial) return;
    const picked = pickValues(settings, keys) as Pick<SettingsValues, K>;
    setInitial(picked);
    setValues(picked);
  }, [settings, initial, keys]);

  const setValue = useCallback(<F extends K>(key: F, value: SettingsValues[F]) => {
    setValues((prev) => (prev ? ({ ...prev, [key]: value } as Pick<SettingsValues, K>) : prev));
    setSaved(false);
  }, []);

  const save = useCallback(async () => {
    if (!values) return;
    setSaving(true);
    setError(null);
    setIssues({});
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (res.status === 400) {
        const body = (await res.json().catch(() => ({}))) as { error?: string; issues?: SettingsIssue[] };
        const byPath = issuesByPath(body.issues ?? []);
        const general = byPath[""];
        delete byPath[""];
        setIssues(byPath);
        if (general || Object.keys(byPath).length === 0) setError(general ?? body.error ?? "Réglages invalides.");
        return;
      }
      if (!res.ok) {
        setError(`Échec de l'enregistrement (HTTP ${res.status}).`);
        return;
      }
      setInitial(values);
      onSavedRef.current?.(values);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2000);
    } catch {
      setError("Échec de l'enregistrement — vérifie ta connexion.");
    } finally {
      setSaving(false);
    }
  }, [values]);

  return {
    values,
    setValue,
    dirty: values !== null && initial !== null && isDirty(initial, values),
    saving,
    saved,
    issues,
    error,
    loadError,
    save,
  };
}
