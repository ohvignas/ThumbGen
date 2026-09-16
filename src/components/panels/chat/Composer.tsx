"use client";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from "@/components/ui/input-group";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { useChatStore } from "@/store/chat-store";
import MicButton from "./MicButton";
import AttachButton from "./AttachButton";
import type { ChatStatus } from "ai";

export default function Composer({
  onSend,
  status,
  onStop,
}: {
  onSend: () => void;
  status: ChatStatus;
  onStop: () => void;
}) {
  const draft = useChatStore((s) => s.draft);
  const setDraft = useChatStore((s) => s.setDraft);
  const attachments = useChatStore((s) => s.attachments);
  const removeAttachment = useChatStore((s) => s.removeAttachment);

  const streaming = status === "streaming" || status === "submitted";
  const canSend = (draft.trim().length > 0 || attachments.length > 0) && !streaming;

  return (
    <div className="w-full space-y-2 p-(--card-spacing)">
      {attachments.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1 nopan nodrag">
          {attachments.map((a) => (
            <div key={a.source} className="relative shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={a.preview_url} alt="attachment" className="h-12 w-12 object-cover rounded border border-border" />
              <button onClick={() => removeAttachment(a.source)} className="absolute -top-1 -right-1 rounded-full w-3.5 h-3.5 text-[8px] leading-none flex items-center justify-center transition-colors bg-destructive text-destructive-foreground" aria-label="Retirer">×</button>
            </div>
          ))}
        </div>
      )}

      <InputGroup className="rounded-xl bg-muted border-border">
        <InputGroupTextarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Décris ta miniature, ou enregistre un vocal…"
          className="h-14 min-h-14 px-3 py-2.5 text-foreground"
          style={{ maxHeight: "160px" }}
          rows={2}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && canSend) {
              e.preventDefault();
              onSend();
            }
          }}
        />
        <InputGroupAddon align="block-end">
          <MicButton onTranscribed={(t) => setDraft(draft ? `${draft} ${t}` : t)} />
          <AttachButton />
          {streaming ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <InputGroupButton onClick={onStop} aria-label="Arrêter" variant="outline" size="icon-sm" className="ml-auto text-destructive">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                      <rect x="6" y="6" width="12" height="12" rx="1" />
                    </svg>
                  </InputGroupButton>
                }
              />
              <TooltipContent>
                <p>Arrêter</p>
              </TooltipContent>
            </Tooltip>
          ) : (
            <Tooltip>
              <TooltipTrigger
                render={
                  <InputGroupButton
                    onClick={onSend}
                    disabled={!canSend}
                    aria-label="Envoyer"
                    variant={canSend ? "default" : "outline"}
                    size="icon-sm"
                    className="ml-auto rounded-full"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="19" x2="12" y2="5" />
                      <polyline points="5 12 12 5 19 12" />
                    </svg>
                  </InputGroupButton>
                }
              />
              <TooltipContent>
                <p>Envoyer</p>
              </TooltipContent>
            </Tooltip>
          )}
        </InputGroupAddon>
      </InputGroup>
    </div>
  );
}
