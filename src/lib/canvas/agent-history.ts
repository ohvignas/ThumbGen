import type { CanvasSnapshotSummary, SnapshotReason } from "@/lib/canvas-snapshots";

/**
 * Client side of « Historique de l'agent »: labels and the two requests on the
 * canvas snapshot routes (src/app/api/project/[id]/snapshots).
 */

export type { CanvasSnapshotSummary };

const REASON_LABELS: Record<SnapshotReason, string> = {
  apply_workflow: "Avant modification de l'agent",
  restore: "Avant restauration",
  place_node: "Avant un nœud de l'interview",
};

export function snapshotReasonLabel(reason: SnapshotReason): string {
  return REASON_LABELS[reason] ?? "Instantané";
}

const pad = (value: number) => String(value).padStart(2, "0");

/** « 08:32 » for today, « 16/09 21:05 » otherwise (local time). */
export function formatSnapshotTime(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  const sameDay =
    date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
  return sameDay ? time : `${pad(date.getDate())}/${pad(date.getMonth() + 1)} ${time}`;
}

async function errorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error || fallback;
  } catch {
    return fallback;
  }
}

export async function fetchAgentSnapshots(projectId: string): Promise<CanvasSnapshotSummary[]> {
  const res = await fetch(`/api/project/${encodeURIComponent(projectId)}/snapshots`, { cache: "no-store" });
  if (!res.ok) throw new Error(await errorMessage(res, "Historique indisponible."));
  const body = (await res.json()) as { snapshots: CanvasSnapshotSummary[] };
  return body.snapshots;
}

export async function restoreAgentSnapshot(projectId: string, snapshotId: string): Promise<void> {
  const res = await fetch(
    `/api/project/${encodeURIComponent(projectId)}/snapshots/${encodeURIComponent(snapshotId)}/restore`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
  );
  if (!res.ok) throw new Error(await errorMessage(res, "Restauration impossible."));
}
