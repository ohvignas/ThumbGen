"use client";
import { useState } from "react";
import { Sparkles, WandSparklesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

/** The message the start button sends: an explicit request for the guided interview (chantier F2). */
export const INTERVIEW_START_MESSAGE = "Aide-moi à construire la miniature de ma vidéo.";

/** A start that did not lead to a turn (e.g. the conversation could not be created) frees the button after this delay. */
export const START_RETRY_MS = 10_000;

/**
 * An empty conversation: what to do first, and one click to start the guided
 * interview. The button is disabled after a click: a double click never sends
 * two paid turns. Once the turn starts the chat is no longer empty and this
 * component unmounts (a new empty conversation mounts a fresh one).
 */
export default function ChatEmptyState({ onStart }: { onStart: () => void }) {
  const [started, setStarted] = useState(false);

  const start = () => {
    if (started) return;
    setStarted(true);
    window.setTimeout(() => setStarted(false), START_RETRY_MS);
    onStart();
  };

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
        <Button size="sm" disabled={started} onClick={start}>
          <WandSparklesIcon data-icon="inline-start" />
          Construire avec l&apos;agent
        </Button>
      </EmptyContent>
    </Empty>
  );
}
