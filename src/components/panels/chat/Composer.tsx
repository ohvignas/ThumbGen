"use client";
import { useRef, useState, type ChangeEvent, type KeyboardEvent, type Ref } from "react";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from "@/components/ui/input-group";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { useChatStore } from "@/store/chat-store";
import MicButton from "./MicButton";
import AttachButton from "./AttachButton";
import SkillPicker from "./SkillPicker";
import type { ChatStatus } from "ai";
import type { SlashSkill } from "@/lib/agent/skills/slash-catalog";
import { applySlashPick, composerSlashQuery, filterSlashSkills, slashQueryAtCursor } from "@/lib/agent/skills/slash-query";

function assignRef(ref: Ref<HTMLTextAreaElement> | undefined, el: HTMLTextAreaElement | null) {
  if (!ref) return;
  if (typeof ref === "function") ref(el);
  else (ref as { current: HTMLTextAreaElement | null }).current = el;
}

export default function Composer({
  onSend,
  status,
  onStop,
  inputRef,
}: {
  onSend: () => void;
  status: ChatStatus;
  onStop: () => void;
  /** The message field, so the panel can give it focus back (e.g. after answering a question). */
  inputRef?: Ref<HTMLTextAreaElement>;
}) {
  const draft = useChatStore((s) => s.draft);
  const setDraft = useChatStore((s) => s.setDraft);
  const attachments = useChatStore((s) => s.attachments);
  const removeAttachment = useChatStore((s) => s.removeAttachment);
  const localRef = useRef<HTMLTextAreaElement>(null);
  const [cursor, setCursor] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [dismissedStart, setDismissedStart] = useState<number | null>(null);

  const streaming = status === "streaming" || status === "submitted";
  const canSend = (draft.trim().length > 0 || attachments.length > 0) && !streaming;

  const openQuery = composerSlashQuery(draft, cursor);
  const pickerOpen = openQuery !== null && openQuery.start !== dismissedStart;
  const items = pickerOpen && openQuery ? filterSlashSkills(openQuery.query) : [];
  const safeIndex = items.length === 0 ? 0 : Math.min(activeIndex, items.length - 1);

  const pick = (skill: SlashSkill) => {
    const next = applySlashPick(draft, cursor, skill.slash);
    setDraft(next.text);
    setCursor(next.cursor);
    setDismissedStart(null);
    setActiveIndex(0);
    requestAnimationFrame(() => {
      const el = localRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(next.cursor, next.cursor);
    });
  };

  const syncCursor = (el: HTMLTextAreaElement) => {
    setCursor(el.selectionStart ?? el.value.length);
  };

  const onChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const nextCursor = e.target.selectionStart ?? value.length;
    const prevQuery = composerSlashQuery(draft, cursor)?.query;
    const nextOpen = composerSlashQuery(value, nextCursor);
    const resolvedCursor =
      nextCursor === 0 && slashQueryAtCursor(value, value.length) ? value.length : nextCursor;
    if (prevQuery !== nextOpen?.query) setActiveIndex(0);
    if (dismissedStart !== null && nextOpen?.start !== dismissedStart) setDismissedStart(null);
    setDraft(value);
    setCursor(resolvedCursor);
  };

  const onComposerKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (pickerOpen) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (items.length > 0) setActiveIndex((index) => (index + 1) % items.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        if (items.length > 0) setActiveIndex((index) => (index - 1 + items.length) % items.length);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        if (openQuery) setDismissedStart(openQuery.start);
        return;
      }
      if ((e.key === "Enter" && !e.shiftKey) || e.key === "Tab") {
        if (items.length > 0) {
          e.preventDefault();
          pick(items[safeIndex]!);
          return;
        }
        if (e.key === "Tab") return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey && canSend) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <div className="relative z-10 w-full space-y-2 p-(--card-spacing)">
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

      {pickerOpen && (
        <SkillPicker items={items} activeIndex={safeIndex} onHover={setActiveIndex} onPick={pick} />
      )}

      <InputGroup className="rounded-xl bg-muted border-border">
        <InputGroupTextarea
          ref={(el) => {
            localRef.current = el;
            assignRef(inputRef, el);
          }}
          value={draft}
          onChange={onChange}
          onClick={(e) => syncCursor(e.currentTarget)}
          onFocus={(e) => syncCursor(e.currentTarget)}
          onSelect={(e) => syncCursor(e.currentTarget)}
          onKeyUp={(e) => syncCursor(e.currentTarget)}
          onKeyDown={onComposerKeyDown}
          placeholder="Décris ta miniature, tape / pour une skill, ou enregistre un vocal…"
          className="h-14 min-h-14 px-3 py-2.5 text-foreground"
          rows={2}
          role="combobox"
          aria-expanded={pickerOpen}
          aria-controls="brainstorm-slash-picker"
          aria-activedescendant={pickerOpen && items[safeIndex] ? `slash-skill-${items[safeIndex].slash}` : undefined}
          aria-autocomplete="list"
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
