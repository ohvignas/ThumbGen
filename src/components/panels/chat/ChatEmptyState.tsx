"use client";
import { Sparkles, WandSparklesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

/** The message the start button sends: an explicit request for the guided interview (chantier F2). */
export const INTERVIEW_START_MESSAGE = "Aide-moi à construire la miniature de ma vidéo.";

/** An empty conversation: what to do first, and one click to start the guided interview. */
export default function ChatEmptyState({ onStart }: { onStart: () => void }) {
  return (
    <Empty className="flex-1 border-none">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Sparkles />
        </EmptyMedia>
        <EmptyTitle>On commence par quoi ?</EmptyTitle>
        <EmptyDescription>Décris ta miniature, joins une image ou enregistre un vocal.</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button size="sm" onClick={onStart}>
          <WandSparklesIcon data-icon="inline-start" />
          Construire avec l&apos;agent
        </Button>
      </EmptyContent>
    </Empty>
  );
}
