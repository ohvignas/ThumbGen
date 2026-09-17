"use client";
import { useState, type FormEvent, type KeyboardEvent } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { SaveField } from "./brief-view";

function FieldError({ id, message }: { id: string; message: string | null }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="text-xs text-destructive">
      {message}
    </p>
  );
}

/**
 * A text field of the « Fiche »: saved on Enter or blur when it changed; the
 * refusal shows under it (announced, and linked to the field). A refused draft
 * is not sent again on blur. The caller keys it by its value, so a new brief
 * resets the draft.
 */
export function BriefTextField({
  id,
  label,
  value,
  maxLength,
  multiline = false,
  onSave,
}: {
  id: string;
  label: string;
  value: string;
  maxLength?: number;
  multiline?: boolean;
  onSave: SaveField;
}) {
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [refusedDraft, setRefusedDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const errorId = `${id}-error`;

  const save = async () => {
    if (saving || draft.trim() === value.trim()) return;
    setSaving(true);
    const message = await onSave(draft);
    setSaving(false);
    setError(message);
    setRefusedDraft(message ? draft : null);
  };

  const onBlur = () => {
    if (draft === refusedDraft) return;
    void save();
  };

  // Enter saves. While composing (macOS inline predictive text), submit on the
  // next tick so the committed text lands in the draft first.
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (!event.nativeEvent.isComposing) {
      void save();
      return;
    }
    const form = event.currentTarget.form;
    setTimeout(() => form?.requestSubmit(), 0);
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void save();
  };

  const described = error ? errorId : undefined;

  return (
    <div className="grid gap-1">
      <Label htmlFor={id} className="text-xs font-normal text-muted-foreground">
        {label}
      </Label>
      {multiline ? (
        <Textarea
          id={id}
          value={draft}
          maxLength={maxLength}
          rows={2}
          aria-invalid={error ? true : undefined}
          aria-describedby={described}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={onBlur}
          className="min-h-0 text-sm"
        />
      ) : (
        <form onSubmit={onSubmit} className="contents">
          <Input
            id={id}
            value={draft}
            maxLength={maxLength}
            aria-invalid={error ? true : undefined}
            aria-describedby={described}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
            onBlur={onBlur}
            className="h-8 text-sm"
          />
        </form>
      )}
      <FieldError id={errorId} message={error} />
    </div>
  );
}

/** A select of the « Fiche »: saved on change. */
export function BriefSelectField({
  id,
  label,
  value,
  items,
  onSave,
}: {
  id: string;
  label: string;
  value: string;
  items: { value: string; label: string }[];
  onSave: SaveField;
}) {
  const [error, setError] = useState<string | null>(null);
  const errorId = `${id}-error`;
  return (
    <div className="grid gap-1">
      <Label htmlFor={id} className="text-xs font-normal text-muted-foreground">
        {label}
      </Label>
      <Select
        items={items}
        value={value}
        onValueChange={(next) => {
          if (typeof next === "string" && next !== value) void onSave(next).then(setError);
        }}
      >
        <SelectTrigger id={id} size="sm" className="w-full" aria-invalid={error ? true : undefined} aria-describedby={error ? errorId : undefined}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FieldError id={errorId} message={error} />
    </div>
  );
}
