"use client";

import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { STUDIO_PHASE_COPY } from "@/lib/studio/agent-phase";

function FilledField({
  empty,
  filling,
  children,
}: {
  empty: boolean;
  filling: boolean;
  children: ReactNode;
}) {
  return (
    <div className="relative">
      {children}
      {filling && empty && (
        <div
          data-studio-skeleton
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 animate-pulse rounded-md bg-muted/60 motion-reduce:animate-none"
        />
      )}
    </div>
  );
}

export default function StudioEditorChrome({
  filling,
  scriptEmpty,
  descriptionEmpty,
  titlesEmpty,
  script,
  description,
  titles,
}: {
  filling: boolean;
  scriptEmpty: boolean;
  descriptionEmpty: boolean;
  titlesEmpty: boolean;
  script: ReactNode;
  description: ReactNode;
  titles: ReactNode;
}) {
  return (
    <>
      {filling && (
        <p aria-live="polite" className="text-sm text-muted-foreground">
          {STUDIO_PHASE_COPY.filling}
        </p>
      )}

      <div className="grid gap-2">
        <Label htmlFor="studio-script">Script Vidéo longue</Label>
        <FilledField filling={filling} empty={scriptEmpty}>
          {script}
        </FilledField>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="studio-description">Description</Label>
        <FilledField filling={filling} empty={descriptionEmpty}>
          {description}
        </FilledField>
      </div>

      <section className="grid gap-3">
        <h2 className="font-heading text-lg font-medium">A/B Titre</h2>
        <FilledField filling={filling} empty={titlesEmpty}>
          {titles}
        </FilledField>
      </section>
    </>
  );
}
