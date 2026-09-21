"use client";

import { X } from "lucide-react";
import ChatPanel from "@/components/panels/ChatPanel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { STUDIO_PHASE_COPY, type StudioAgentPhase } from "@/lib/studio/agent-phase";
import { writingProjectId } from "@/lib/studio/types";

export default function StudioCreateOverlay({
  videoId,
  phase,
  onDismiss,
  pendingSend = null,
  onPendingSendConsumed,
}: {
  videoId: string;
  phase: StudioAgentPhase;
  onDismiss: () => void;
  pendingSend?: string | null;
  onPendingSendConsumed?: () => void;
}) {
  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onDismiss();
      }}
    >
      <DialogContent
        aria-modal="true"
        showCloseButton={false}
        overlayClassName="bg-black/60"
        className="flex h-[70vh] max-h-[70vh] w-full max-w-3xl flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl"
      >
        <div className="flex items-start justify-between gap-3 border-b px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <div className="min-w-0">
            <DialogTitle className="font-heading text-2xl font-medium text-pretty">
              Nouvelle vidéo
            </DialogTitle>
            <DialogDescription className="sr-only">
              Chat avec l&apos;agent d&apos;écriture. Pas un formulaire titre et description.
            </DialogDescription>
            <p aria-live="polite" className="text-sm text-muted-foreground">
              {STUDIO_PHASE_COPY[phase]}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Fermer"
            className="size-11"
            onClick={onDismiss}
          >
            <X />
          </Button>
        </div>
        <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="min-h-0 flex-1 overflow-hidden overscroll-contain">
            <ChatPanel
              projectId={writingProjectId(videoId)}
              layout="overlay"
              pendingSend={pendingSend}
              onPendingSendConsumed={onPendingSendConsumed}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
