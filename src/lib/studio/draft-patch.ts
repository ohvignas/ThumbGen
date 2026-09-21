import type { StudioDraft, TitleVariant } from "./types";

function isTitleVariant(value: unknown): value is TitleVariant {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<TitleVariant>;
  return (
    typeof v.title === "string" &&
    typeof v.thumbText === "string" &&
    typeof v.visualConcept === "string"
  );
}

function isStudioTitleVariants(value: unknown): value is StudioDraft["titleVariants"] {
  if (!Array.isArray(value) || value.length !== 3) return false;
  return value.every(isTitleVariant);
}

export const STUDIO_DRAFT_PATCH_PART = "data-studio-draft-patch" as const;

export type StudioDraftPatch = {
  videoId: string;
  projectId: string;
  updatedAt: string;
  previousUpdatedAt: string;
  title: string;
  summary: string;
  script: string;
  description: string;
  titleVariants: StudioDraft["titleVariants"];
  phase: "filling";
};

export function isStudioDraftPatch(value: unknown): value is StudioDraftPatch {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<StudioDraftPatch>;
  return (
    typeof row.videoId === "string" &&
    typeof row.projectId === "string" &&
    typeof row.updatedAt === "string" &&
    typeof row.previousUpdatedAt === "string" &&
    typeof row.title === "string" &&
    typeof row.summary === "string" &&
    typeof row.script === "string" &&
    typeof row.description === "string" &&
    isStudioTitleVariants(row.titleVariants) &&
    row.phase === "filling"
  );
}

/** An ISO string or a legacy SQLite `datetime('now')` value (UTC, no zone), in ms; null when unparsable. */
function parseTimestamp(value: string): number | null {
  // Strict formats only: Date.parse is lenient with arbitrary strings ("SELF-SAVE-1" parses in V8).
  // SQLite: datetime('now') or strftime('%Y-%m-%d %H:%M:%f') — UTC, no zone, optional fraction.
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d{1,6})?$/.test(value) ? `${value.replace(" ", "T")}Z` : value;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/.test(iso)) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

export function shouldApplyStudioDraftPatch(
  patch: StudioDraftPatch,
  state: { openVideoId: string; knownUpdatedAt: string | null },
): boolean {
  if (patch.videoId !== state.openVideoId) return false;
  if (!state.knownUpdatedAt) return true;
  const next = parseTimestamp(patch.updatedAt);
  const known = parseTimestamp(state.knownUpdatedAt);
  if (next === null || known === null) return true;
  return next > known;
}
