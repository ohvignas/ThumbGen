"use client";
import type { ReactNode } from "react";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import type { BriefPatchInput } from "@/lib/brief/merge";
import type { BriefVariant, ThumbnailBrief } from "@/lib/brief/schema";
import BriefComposition from "./BriefComposition";
import { BriefSelectField, BriefTextField } from "./BriefFields";
import {
  SKETCH_STATUS_LABELS,
  TEXT_MODE_ITEMS,
  fieldSaver,
  formatScore,
  imageUrlOf,
  strategyLabel,
  textModePatch,
  variantFieldPatch,
  videoFieldPatch,
  type PatchBrief,
  type SaveField,
} from "./brief-view";

type Save = (build: (value: string) => BriefPatchInput | string) => SaveField;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2 py-3 first:pt-0">
      <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</h3>
      {children}
    </section>
  );
}

function Muted({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

function Thumb({ source, label, square = false }: { source: string; label: string; square?: boolean }) {
  const src = imageUrlOf(source);
  const shape = square ? "aspect-square" : "aspect-video";
  return (
    <figure className="flex w-28 flex-col gap-1">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={label} loading="lazy" className={cn("w-full rounded-md border object-cover", shape)} />
      ) : (
        <span className={cn("block w-full rounded-md bg-muted", shape)} />
      )}
      <figcaption className="truncate text-xs text-muted-foreground">{label}</figcaption>
    </figure>
  );
}

function VariantCard({ variant, save }: { variant: BriefVariant; save: Save }) {
  const text = (field: "title" | "thumbnailText" | "visualIdea", label: string, maxLength: number, multiline = false) => (
    <BriefTextField
      key={`${field}-${variant[field]}`}
      id={`brief-${variant.key}-${field}`}
      label={label}
      value={variant[field]}
      maxLength={maxLength}
      multiline={multiline}
      onSave={save((value) => variantFieldPatch(variant.key, field, value))}
    />
  );
  return (
    <article className="flex flex-col gap-2 rounded-lg border p-3">
      <h4 className="text-sm font-medium">
        Variante {variant.key} — {variant.direction}
      </h4>
      {text("title", "Titre", 60)}
      {text("thumbnailText", "Texte de la miniature", 20)}
      {text("visualIdea", "Idée visuelle", 120, true)}
      <p className="text-xs text-muted-foreground">
        Rôle du titre : {variant.titleRole} · Rôle de la miniature : {variant.thumbRole}
      </p>
      {variant.composition ? (
        <BriefComposition variant={variant} card={variant.composition} save={save} />
      ) : (
        <Muted>Carte de composition pas encore remplie.</Muted>
      )}
      {variant.sketch && (
        <div className="flex flex-col gap-1">
          <Thumb source={variant.sketch.source} label={SKETCH_STATUS_LABELS[variant.sketch.status]} />
          {variant.sketch.review?.note && <p className="text-xs text-muted-foreground">{variant.sketch.review.note}</p>}
        </div>
      )}
    </article>
  );
}

/** The thumbnail brief, section by section; the editable fields save through `onPatch`. */
export default function BriefPanel({ brief, onPatch }: { brief: ThumbnailBrief; onPatch: PatchBrief }) {
  const save: Save = (build) => fieldSaver(onPatch, build);
  const persona = brief.common.persona;

  return (
    <div className="flex flex-col divide-y">
      <Section title="Vidéo et promesse">
        {brief.video.subject ? <p className="text-sm">{brief.video.subject}</p> : <Muted>Sujet pas encore décrit.</Muted>}
        <BriefTextField
          key={`promise-${brief.video.promise ?? ""}`}
          id="brief-video-promise"
          label="Promesse"
          value={brief.video.promise ?? ""}
          maxLength={90}
          onSave={save((value) => videoFieldPatch("promise", value))}
        />
        <BriefTextField
          key={`audience-${brief.video.audience ?? ""}`}
          id="brief-video-audience"
          label="Public"
          value={brief.video.audience ?? ""}
          maxLength={120}
          onSave={save((value) => videoFieldPatch("audience", value))}
        />
      </Section>

      <Section title="Recherche">
        {brief.research ? (
          <>
            <p className="text-sm">{brief.research.summary}</p>
            {brief.research.sources.length > 0 && (
              <ul className="flex flex-col gap-1">
                {brief.research.sources.map((source) => (
                  <li key={source.url}>
                    <a href={source.url} target="_blank" rel="noreferrer" className="text-sm text-primary underline-offset-4 hover:underline">
                      {source.title}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <Muted>Pas encore de recherche.</Muted>
        )}
      </Section>

      <Section title="Logos">
        {brief.logos.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {brief.logos.map((logo) => (
              <Thumb key={logo.source} source={logo.source} label={logo.name} square />
            ))}
          </div>
        ) : (
          <Muted>Aucun logo.</Muted>
        )}
      </Section>

      <Section title="Concurrents">
        {brief.competition && (
          <div className="flex flex-col gap-1 text-sm">
            <p>
              <span className="font-medium">Ce qui marche : </span>
              {brief.competition.patterns.join(" · ") || "—"}
            </p>
            <p>
              <span className="font-medium">À éviter : </span>
              {brief.competition.saturation.join(" · ") || "—"}
            </p>
          </div>
        )}
        {brief.references.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {brief.references.map((reference) => (
              <Thumb key={reference.videoId} source={reference.source} label={`${formatScore(reference.score)} · ${reference.title}`} />
            ))}
          </div>
        )}
        {!brief.competition && brief.references.length === 0 && <Muted>Pas encore d&apos;analyse des concurrents.</Muted>}
      </Section>

      <Section title="Stratégie et éléments communs">
        <p className="text-sm">{strategyLabel(brief)}</p>
        {persona === "none" && <Muted>Sans personnage.</Muted>}
        {persona && persona !== "none" && <Thumb source={persona} label="Personnage" square />}
        {!persona && <Muted>Personnage pas encore choisi.</Muted>}
        {brief.common.style && <p className="text-sm">{brief.common.style}</p>}
        {brief.common.colors && brief.common.colors.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {brief.common.colors.map((color) => (
              <Badge key={color} variant="outline" className="font-mono">
                {color}
              </Badge>
            ))}
          </div>
        )}
        <BriefSelectField
          id="brief-text-mode"
          label="Texte de la miniature"
          value={brief.common.textMode}
          items={TEXT_MODE_ITEMS}
          onSave={save(textModePatch)}
        />
      </Section>

      <Section title="Variantes">
        {brief.variants.length === 0 ? (
          <Muted>Pas encore de variante.</Muted>
        ) : (
          brief.variants.map((variant) => <VariantCard key={variant.key} variant={variant} save={save} />)
        )}
      </Section>
    </div>
  );
}
