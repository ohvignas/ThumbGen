"use client";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { CheckIcon, ImageOffIcon } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Toggle } from "@/components/ui/toggle";
import {
  ASK_USER_LIMITS,
  ASK_USER_TOTAL_STEPS,
  askUserMaxSelected,
  askUserOptionImage,
  parseAskUserInput,
  type AskUserOption,
  type AskUserOutput,
} from "@/lib/agent/browser-tools/ask-user";

const TILE_CLASS =
  "h-auto w-full min-w-0 flex-col items-stretch gap-1 p-1 text-left whitespace-normal transition-colors motion-reduce:transition-none aria-pressed:border-primary aria-pressed:bg-primary/5";
const ROW_CLASS =
  "h-auto w-full min-w-0 flex-col items-start gap-0.5 px-2.5 py-1.5 text-left whitespace-normal transition-colors motion-reduce:transition-none aria-pressed:border-primary aria-pressed:bg-primary/5";

function OptionText({ option }: { option: AskUserOption }) {
  return (
    <>
      <span className="w-full truncate text-xs font-medium">{option.label}</span>
      {option.description && (
        <span className="line-clamp-1 w-full text-[11px] font-normal text-muted-foreground">{option.description}</span>
      )}
    </>
  );
}

function OptionThumbnail({
  option,
  shape,
  failed,
  selected,
  onError,
}: {
  option: AskUserOption;
  shape: "wide" | "square";
  failed: boolean;
  selected: boolean;
  onError: () => void;
}) {
  const image = askUserOptionImage(option.image);
  return (
    <span
      className={cn(
        "relative block w-full overflow-hidden rounded-md bg-muted",
        shape === "square" ? "aspect-square" : "aspect-video",
      )}
    >
      {image && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image.src} alt="" loading="lazy" className="size-full object-cover" onError={onError} />
      ) : (
        <span data-slot="ask-user-placeholder" className="flex size-full items-center justify-center text-muted-foreground">
          <ImageOffIcon className="size-4" aria-hidden="true" />
        </span>
      )}
      {selected && (
        <span className="absolute top-1 right-1 flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <CheckIcon className="size-3" aria-hidden="true" />
        </span>
      )}
    </span>
  );
}

/**
 * One thumbnail-journey question (`ask_user`): options as a thumbnail grid or a
 * list, « Autre… » free text and « Passer »; with no option, only the free text
 * field (« Ta réponse… »). Answers exactly once — every control is disabled
 * after the first answer, and enabled again only when `onAnswer` throws or its
 * promise rejects (the answer was not sent).
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
  const [failedImages, setFailedImages] = useState<string[]>([]);
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
  const firstImage = question.options.map((option) => askUserOptionImage(option.image)).find((image) => image !== null);
  const shape = firstImage?.shape ?? null;
  const freeQuestion = question.options.length === 0;

  const toggle = (id: string, pressed: boolean) =>
    setSelected((current) => (pressed ? [...current.filter((value) => value !== id), id] : current.filter((value) => value !== id)));

  const renderOption = (option: AskUserOption): ReactNode => {
    const isSelected = selected.includes(option.id);
    const content = shape ? (
      <>
        <OptionThumbnail
          option={option}
          shape={shape}
          failed={failedImages.includes(option.id)}
          selected={isSelected}
          onError={() => setFailedImages((current) => (current.includes(option.id) ? current : [...current, option.id]))}
        />
        <OptionText option={option} />
      </>
    ) : (
      <OptionText option={option} />
    );

    if (question.multiple) {
      return (
        <Toggle
          key={option.id}
          variant="outline"
          size="sm"
          className={shape ? TILE_CLASS : ROW_CLASS}
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
        className={shape ? TILE_CLASS : ROW_CLASS}
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
      <div className="flex flex-col gap-0.5">
        <p className="text-xs text-muted-foreground">
          Étape {question.step}/{ASK_USER_TOTAL_STEPS}
        </p>
        <p className="text-sm leading-snug font-medium text-foreground">{question.question}</p>
      </div>

      {!freeQuestion && (
        <div
          className={cn(
            shape ? "grid gap-1.5" : question.options.length > 6 ? "grid grid-cols-2 gap-1.5" : "flex flex-col gap-1.5",
            shape === "wide" && "grid-cols-2",
            shape === "square" && "grid-cols-3",
          )}
        >
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
          // Explicit Enter, like the composer: the form's implicit submission is skipped while the field
          // is composing, and macOS inline predictive text keeps it composing (Enter arrived with
          // isComposing: true and did nothing, while « Envoyer » worked).
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            sendOther();
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
