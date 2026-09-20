export type SaveStatusKind = "saving" | "saved" | "error";

export function saveStatusKind(state: {
  dirty: boolean;
  saving: boolean;
  saveError: string | null;
}): SaveStatusKind {
  if (state.saveError) return "error";
  if (state.dirty || state.saving) return "saving";
  return "saved";
}

export function saveStatusLabel(kind: SaveStatusKind): string {
  if (kind === "error") return "Erreur de sauvegarde";
  if (kind === "saving") return "Enregistrement…";
  return "Enregistré";
}

/** Date + time in French locale (Europe/Paris), e.g. `18/09/2026 23:31`. */
export function formatSavedAt(value: string): string | null {
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d{1,6})?$/.test(value)
    ? `${value.replace(" ", "T")}Z`
    : value;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toLocaleString("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Paris",
  });
}
