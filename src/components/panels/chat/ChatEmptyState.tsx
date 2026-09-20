"use client";
import { Sparkles } from "lucide-react";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

/** Natural-language trigger for thumbnail-packaging — not a UI button. */
export const INTERVIEW_START_MESSAGE = "Aide-moi à construire la miniature de ma vidéo.";

/** Empty conversation: title plus how to start (slash skills, image, vocal). */
export default function ChatEmptyState() {
  return (
    <Empty className="flex-1 border-none">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Sparkles />
        </EmptyMedia>
        <EmptyTitle>On commence par quoi ?</EmptyTitle>
        <EmptyDescription>Décris ta miniature, tape / pour une skill (ex. /croquis), @ pour pointer une miniature, joins une image ou enregistre un vocal.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
