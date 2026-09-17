"use client";

import { useState } from "react";
import { History } from "lucide-react";
import { useCanvasStore } from "@/store/canvas-store";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import ConfirmDialog from "@/components/settings/ConfirmDialog";
import {
  fetchAgentSnapshots,
  formatSnapshotTime,
  restoreAgentSnapshot,
  snapshotReasonLabel,
  type CanvasSnapshotSummary,
} from "@/lib/canvas/agent-history";

/**
 * « Historique de l'agent » in the canvas toolbar: the canvas states saved
 * before each agent write (and before each restore), newest first, each
 * restorable after a confirmation. The restore reloads the project in the
 * store right away instead of waiting for useCanvasSync's poll.
 */
export default function AgentHistoryMenu() {
  const projectId = useCanvasStore((s) => s.currentProjectId);
  const loadProject = useCanvasStore((s) => s.loadProject);
  const flushPendingSave = useCanvasStore((s) => s.flushPendingSave);
  const [snapshots, setSnapshots] = useState<CanvasSnapshotSummary[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [pending, setPending] = useState<CanvasSnapshotSummary | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  const load = async () => {
    setSnapshots(null);
    setListError(null);
    try {
      setSnapshots(await fetchAgentSnapshots(projectId));
    } catch (err) {
      setListError(err instanceof Error ? err.message : "Historique indisponible.");
      setSnapshots([]);
    }
  };

  const confirmRestore = async () => {
    if (!pending) return;
    setRestoring(true);
    setRestoreError(null);
    try {
      // A local edit still waiting on its autosave is saved first: it ends up in
      // the « Avant restauration » snapshot and can't be written back afterwards.
      await flushPendingSave();
      await restoreAgentSnapshot(projectId, pending.id);
      await loadProject(projectId);
      setPending(null);
    } catch (err) {
      setRestoreError(err instanceof Error ? err.message : "Restauration impossible.");
    } finally {
      setRestoring(false);
    }
  };

  const pendingWhen = pending ? formatSnapshotTime(pending.created_at) : "";
  const description = pending
    ? `Le canvas revient à son état de ${pendingWhen} (${snapshotReasonLabel(pending.reason).toLowerCase()}, ${pending.node_count} étape${pending.node_count > 1 ? "s" : ""}). L'état actuel est gardé dans l'historique : tu pourras y revenir.${restoreError ? ` ${restoreError}` : ""}`
    : "";

  return (
    <>
      <DropdownMenu
        onOpenChange={(open) => {
          if (open) void load();
        }}
      >
        <Tooltip>
          <TooltipTrigger
            render={
              <DropdownMenuTrigger
                render={<Button variant="ghost" size="icon" aria-label="Historique de l&apos;agent" />}
              />
            }
          >
            <History className="size-4" />
          </TooltipTrigger>
          <TooltipContent>
            <p>Historique de l&apos;agent</p>
          </TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="center" side="top" className="w-72">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Historique de l&apos;agent</DropdownMenuLabel>
            {snapshots === null ? (
              <DropdownMenuItem disabled>Chargement…</DropdownMenuItem>
            ) : listError ? (
              <DropdownMenuItem disabled>{listError}</DropdownMenuItem>
            ) : snapshots.length === 0 ? (
              <DropdownMenuItem disabled>Aucune modification de l&apos;agent pour l&apos;instant.</DropdownMenuItem>
            ) : (
              snapshots.map((snapshot) => (
                <DropdownMenuItem
                  key={snapshot.id}
                  className="justify-between gap-3"
                  onClick={() => {
                    setRestoreError(null);
                    setPending(snapshot);
                  }}
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate">{snapshotReasonLabel(snapshot.reason)}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {formatSnapshotTime(snapshot.created_at)} · {snapshot.node_count} étape
                      {snapshot.node_count > 1 ? "s" : ""}
                    </span>
                  </span>
                  <span className="text-xs font-medium">Restaurer</span>
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open && !restoring) setPending(null);
        }}
        title="Restaurer cet état du canvas ?"
        description={description}
        confirmLabel="Restaurer"
        destructive={false}
        busy={restoring}
        onConfirm={() => void confirmRestore()}
        contentClassName="nokey"
      />
    </>
  );
}
