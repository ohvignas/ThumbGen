"use client";
import { Sparkles } from "lucide-react";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import type { AgentSurface } from "@/lib/studio/agent-surface";

/** Natural-language trigger for thumbnail-packaging — not a UI button. */
export const INTERVIEW_START_MESSAGE = "Aide-moi à construire la miniature de ma vidéo.";

export const CANVAS_EMPTY_DESCRIPTION =
  "Décris ta miniature, tape / pour une skill (ex. /croquis), @ pour pointer une miniature, joins une image ou enregistre un vocal.";

export const STUDIO_EMPTY_DESCRIPTION = "Décris l’idée de la vidéo…";

/** Empty conversation: title plus how to start (slash skills, image, vocal). */
export default function ChatEmptyState({ surface = "canvas" }: { surface?: AgentSurface }) {
  return (
    <Empty className="flex-1 border-none">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Sparkles />
        </EmptyMedia>
        <EmptyTitle>On commence par quoi ?</EmptyTitle>
        <EmptyDescription>
          {surface === "studio" ? STUDIO_EMPTY_DESCRIPTION : CANVAS_EMPTY_DESCRIPTION}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
