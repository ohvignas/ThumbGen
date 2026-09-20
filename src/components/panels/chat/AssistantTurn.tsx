"use client";
import { useState } from "react";
import { CheckIcon, ChevronRightIcon, CopyIcon, RotateCcwIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { MessageFooter, MessageHeader } from "@/components/ui/message";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useChatStore } from "@/store/chat-store";
import { TextMarkdown } from "./TextMarkdown";
import PromptResultCard from "./PromptResultCard";
import TurnResults from "./TurnResults";
import TurnSteps from "./TurnSteps";
import { turnHeaderLabel, type AssistantTurn as AssistantTurnModel, type TurnError } from "./turn-model";

function CopyAnswerButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard refused (permission, insecure context): nothing to confirm.
    }
  };

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button variant="ghost" size="icon-xs" aria-label="Copier la réponse" onClick={copy}>
            {copied ? <CheckIcon /> : <CopyIcon />}
          </Button>
        }
      />
      <TooltipContent>
        <p>{copied ? "Copié" : "Copier la réponse"}</p>
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * A finished assistant turn: folded « 12 s · 4 étapes » header, the answer,
 * the visual results, « Et maintenant » (last turn only) and a copy button.
 * On error the answer is replaced by a compact Alert with « Réessayer ».
 */
export default function AssistantTurn({
  turn,
  error,
  showActions: _showActions,
  onRetry,
  onAskAgent: _onAskAgent,
}: {
  turn: AssistantTurnModel;
  error: TurnError | null;
  showActions: boolean;
  onRetry: (() => void) | null;
  onAskAgent: (message: string) => void;
}) {
  const openAnnotate = useChatStore((s) => s.openAnnotate);

  return (
    <>
      {turn.stepCount > 0 && (
        <Collapsible className="flex flex-col gap-2">
          <MessageHeader className="px-0">
            <CollapsibleTrigger render={<Button variant="ghost" size="xs" className="group/steps -ml-2 text-muted-foreground" />}>
              <ChevronRightIcon data-icon="inline-start" className="transition-transform group-data-[panel-open]/steps:rotate-90 motion-reduce:transition-none" />
              {turnHeaderLabel(turn)}
            </CollapsibleTrigger>
          </MessageHeader>
          <CollapsibleContent>
            <TurnSteps steps={turn.steps} live={false} />
          </CollapsibleContent>
        </Collapsible>
      )}

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>{error.title}</AlertTitle>
          <AlertDescription>{error.description}</AlertDescription>
          {onRetry && (
            <div className="mt-2">
              <Button variant="outline" size="xs" onClick={onRetry}>
                <RotateCcwIcon data-icon="inline-start" />
                Réessayer
              </Button>
            </div>
          )}
        </Alert>
      ) : (
        turn.answer && (
          <Bubble variant="ghost" className="max-w-full">
            <BubbleContent className="animate-in duration-300 fade-in motion-reduce:animate-none">
              <TextMarkdown text={turn.answer} openAnnotate={openAnnotate} />
            </BubbleContent>
          </Bubble>
        )
      )}

      <TurnResults results={turn.results} />

      {turn.promptCards.map((card) => (
        <PromptResultCard key={card.nodeId || card.prompt} nodeId={card.nodeId} prompt={card.prompt} />
      ))}

      {!error && turn.answer && (
        <MessageFooter className="px-0">
          <CopyAnswerButton text={turn.answer} />
        </MessageFooter>
      )}
    </>
  );
}
