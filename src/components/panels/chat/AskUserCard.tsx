"use client";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Toggle } from "@/components/ui/toggle";
import {
  ASK_USER_LIMITS,
  askUserMaxSelected,
  parseAskUserInput,
  type AskUserOption,
  type AskUserOutput,
} from "@/lib/agent/browser-tools/ask-user";

const ROW_CLASS =
  "h-auto w-full min-w-0 flex-col items-start justify-start gap-0.5 px-2.5 py-1.5 text-left whitespace-normal transition-colors motion-reduce:transition-none aria-pressed:border-primary aria-pressed:bg-primary/5";

function OptionText({ option }: { option: AskUserOption }) {
  return (
    <>
      <span className="w-full text-xs font-medium whitespace-normal">{option.label}</span>
      {option.description && (
        <span className="w-full text-[11px] font-normal text-muted-foreground whitespace-normal">
          {option.description}
        </span>
      )}
    </>
  );
}

/**
 * One `ask_user` card: options as a text list (full label + description),
 * « Autre… » free text and « Passer »; with no option, only the free text
 * field (« Ta réponse… »). Photos on options are ignored. Answers exactly
 * once — every control is disabled after the first answer, and enabled
 * again only when `onAnswer` throws or its promise rejects.
 */
export default function AskUserCard({
  input,
  onAnswer,
}: {
  input: unknown;
  onAnswer: (output: AskUserOutput) => void | Promise<unknown>;
}) {
  const [answered, setAnswered] = useState(false);
  const answeredRef = useRef(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [other, setOther] = useState("");
  const groupRef = useRef<HTMLDivElement>(null);

  // A new question takes the focus (keyboard and screen reader users land on it),
  // unless the user is typing something elsewhere.
  useEffect(() => {
    const active = document.activeElement;
    const typing =
      active instanceof HTMLElement &&
      !groupRef.current?.contains(active) &&
      (active.isContentEditable ||
        ((active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) && active.value.trim() !== ""));
    if (!typing) groupRef.current?.focus({ preventScroll: true });
  }, []);

  const unlock = (error: unknown) => {
    console.error("[ask_user] the answer could not be sent:", error);
    answeredRef.current = false;
    setAnswered(false);
  };

  const answer = (output: AskUserOutput) => {
    if (answeredRef.current) return;
    answeredRef.current = true;
    setAnswered(true);
    try {
      const sent = onAnswer(output);
      if (sent instanceof Promise) sent.catch(unlock);
    } catch (error) {
      unlock(error);
    }
  };

  const question = parseAskUserInput(input);

  const skipButton = (
    <Button variant="ghost" size="sm" disabled={answered} onClick={() => answer({ skipped: true })}>
      Passer
    </Button>
  );

  if (!question) {
    return (
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Question illisible</p>
        {skipButton}
      </div>
    );
  }

  const maxSelected = askUserMaxSelected(question);
  const freeQuestion = question.options.length === 0;

  const toggle = (id: string, pressed: boolean) =>
    setSelected((current) => (pressed ? [...current.filter((value) => value !== id), id] : current.filter((value) => value !== id)));

  const renderOption = (option: AskUserOption): ReactNode => {
    const isSelected = selected.includes(option.id);
    const content = <OptionText option={option} />;

    if (question.multiple) {
      return (
        <Toggle
          key={option.id}
          variant="outline"
          size="sm"
          className={ROW_CLASS}
          pressed={isSelected}
          disabled={answered || (!isSelected && selected.length >= maxSelected)}
          onPressedChange={(pressed) => toggle(option.id, pressed)}
        >
          {content}
        </Toggle>
      );
    }
    return (
      <Button
        key={option.id}
        variant="outline"
        size="sm"
        className={ROW_CLASS}
        disabled={answered}
        onClick={() => answer({ selected: [option.id] })}
      >
        {content}
      </Button>
    );
  };

  const sendOther = () => {
    const text = other.trim();
    if (text) answer({ other: text });
  };

  const submitOther = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    sendOther();
  };

  return (
    <div ref={groupRef} tabIndex={-1} role="group" aria-label={question.question} className="flex flex-col gap-2.5 outline-none">
      <p className="text-sm leading-snug font-medium text-foreground">{question.question}</p>

      {!freeQuestion && (
        <div className={cn(question.options.length > 6 ? "grid grid-cols-2 gap-1.5" : "flex flex-col gap-1.5")}>
          {question.options.map(renderOption)}
        </div>
      )}

      {question.multiple && (
        <p className="-mt-1 text-xs text-muted-foreground">
          Jusqu&apos;à {maxSelected} choix
        </p>
      )}

      {question.multiple && (
        <Button
          size="sm"
          className="self-start"
          disabled={answered || selected.length === 0}
          onClick={() =>
            answer({ selected: question.options.map((option) => option.id).filter((id) => selected.includes(id)) })
          }
        >
          Valider
        </Button>
      )}

      <form onSubmit={submitOther} className="flex gap-1.5">
        <Input
          value={other}
          onChange={(event) => setOther(event.target.value)}
          // Explicit Enter: the form's implicit submission is skipped while the field is composing, and
          // macOS inline predictive text keeps it composing (Enter did nothing while « Envoyer » worked).
          // While composing, submit on the next tick so the committed text lands first.
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            if (!event.nativeEvent.isComposing) {
              sendOther();
              return;
            }
            const form = event.currentTarget.form;
            setTimeout(() => form?.requestSubmit(), 0);
          }}
          maxLength={ASK_USER_LIMITS.other}
          placeholder={freeQuestion ? "Ta réponse…" : "Autre…"}
          aria-label={freeQuestion ? "Ta réponse" : "Autre réponse"}
          disabled={answered}
          className="h-7 text-xs md:text-xs"
        />
        <Button type="submit" variant="outline" size="sm" disabled={answered || other.trim() === ""}>
          Envoyer
        </Button>
      </form>

      {question.allow_skip && <div className="flex justify-end">{skipButton}</div>}
    </div>
  );
}
