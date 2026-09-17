"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Rename form. Mount it with a `key` per item so the field starts from
 * `initialValue`. `onSubmit` resolves an error message (dialog stays open) or null.
 */
export default function RenameDialog({
  open,
  onOpenChange,
  title,
  description,
  initialValue,
  maxLength,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  initialValue: string;
  maxLength: number;
  onSubmit: (value: string) => Promise<string | null>;
}) {
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const trimmed = value.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!trimmed || saving) return;
            setSaving(true);
            setError(null);
            try {
              const message = await onSubmit(trimmed);
              if (message) setError(message);
              else onOpenChange(false);
            } finally {
              setSaving(false);
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="library-rename">Nom</Label>
            <Input
              id="library-rename"
              value={value}
              maxLength={maxLength}
              autoFocus
              aria-invalid={Boolean(error)}
              onChange={(event) => setValue(event.target.value)}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={!trimmed || saving}>
              {saving ? "Enregistrement…" : "Renommer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
