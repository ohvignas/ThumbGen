"use client";
import { Badge } from "@/components/ui/badge";
import type { BriefPatchInput } from "@/lib/brief/merge";
import type { BriefVariant, Composition } from "@/lib/brief/schema";
import { BriefSelectField, BriefTextField } from "./BriefFields";
import {
  BACKGROUND_ITEMS,
  EMOTION_ITEMS,
  GRID_ITEMS,
  INTENSITY_ITEMS,
  LAYOUT_LABELS,
  MOUTH_ITEMS,
  compositionPatch,
  type SaveField,
} from "./brief-view";

type Save = (build: (value: string) => BriefPatchInput | string) => SaveField;
type Change = (card: Composition, value: string) => Composition | string;

const integer = (value: string): number | null => {
  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isInteger(parsed) ? parsed : null;
};

/** The composition card of one variant; every edit sends the whole card (the merge replaces it). */
export default function BriefComposition({ variant, card, save }: { variant: BriefVariant; card: Composition; save: Save }) {
  const edit = (change: Change) =>
    save((value) => {
      const next = change(structuredClone(card), value);
      return typeof next === "string" ? next : compositionPatch(variant.key, next);
    });
  const id = (field: string) => `brief-${variant.key}-${field}`;

  return (
    <div className="flex flex-col gap-2 rounded-md bg-muted/40 p-2">
      <p className="text-xs text-muted-foreground">
        {LAYOUT_LABELS[card.layout]}
        {card.layoutNote ? ` — ${card.layoutNote}` : ""}
      </p>
      <BriefTextField key={`focal-${card.focal}`} id={id("focal")} label="Sujet focal" value={card.focal} maxLength={80} onSave={edit((c, v) => ({ ...c, focal: v.trim() }))} />

      {card.elements.map((element, index) => (
        <div key={index} className="grid grid-cols-[1fr_4.5rem_7rem] items-end gap-1.5">
          <BriefTextField
            key={`what-${element.what}`}
            id={id(`element-${index}-what`)}
            label={element.role === "hero" ? "Héros" : "Élément"}
            value={element.what}
            maxLength={80}
            onSave={edit((c, v) => {
              c.elements[index] = { ...c.elements[index], what: v.trim() };
              return c;
            })}
          />
          <BriefTextField
            key={`size-${element.sizePct}`}
            id={id(`element-${index}-size`)}
            label="Taille %"
            value={String(element.sizePct)}
            onSave={edit((c, v) => {
              const size = integer(v);
              if (size === null) return "Nombre entier attendu";
              c.elements[index] = { ...c.elements[index], sizePct: size };
              return c;
            })}
          />
          <BriefSelectField
            id={id(`element-${index}-position`)}
            label="Position"
            value={element.position}
            items={GRID_ITEMS}
            onSave={edit((c, v) => {
              const position = GRID_ITEMS.find((item) => item.value === v)?.value as Composition["elements"][number]["position"] | undefined;
              if (!position) return "Position inconnue";
              c.elements[index] = { ...c.elements[index], position };
              return c;
            })}
          />
        </div>
      ))}
      <div className="flex flex-wrap gap-1">
        {card.elements.map((element, index) => (
          <Badge key={index} variant={element.role === "hero" ? "default" : "secondary"}>
            {element.role === "hero" ? "Héros" : "Soutien"} · {element.sizePct} %
          </Badge>
        ))}
      </div>

      {card.textZone ? (
        <div className="grid grid-cols-2 gap-1.5">
          <BriefSelectField
            id={id("text-zone-position")}
            label="Zone de texte"
            value={card.textZone.position}
            items={GRID_ITEMS}
            onSave={edit((c, v) => {
              const position = GRID_ITEMS.find((item) => item.value === v)?.value as Composition["elements"][number]["position"] | undefined;
              if (!position || !c.textZone) return "Position inconnue";
              return { ...c, textZone: { ...c.textZone, position } };
            })}
          />
          <BriefTextField
            key={`zone-${card.textZone.heightPct}`}
            id={id("text-zone-height")}
            label="Hauteur %"
            value={String(card.textZone.heightPct)}
            onSave={edit((c, v) => {
              const height = integer(v);
              if (height === null || !c.textZone) return "Nombre entier attendu";
              return { ...c, textZone: { ...c.textZone, heightPct: height } };
            })}
          />
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Pas de zone de texte.</p>
      )}

      <div className="grid grid-cols-2 gap-1.5">
        <BriefSelectField
          id={id("background-kind")}
          label="Fond"
          value={card.background.kind}
          items={BACKGROUND_ITEMS}
          onSave={edit((c, v) => {
            const kind = BACKGROUND_ITEMS.find((item) => item.value === v)?.value as Composition["background"]["kind"] | undefined;
            return kind ? { ...c, background: { ...c.background, kind } } : "Fond inconnu";
          })}
        />
        <BriefTextField
          key={`bg-color-${card.background.color ?? ""}`}
          id={id("background-color")}
          label="Couleur du fond"
          value={card.background.color ?? ""}
          maxLength={7}
          onSave={edit((c, v) => ({ ...c, background: { ...c.background, color: v.trim() || undefined } }))}
        />
      </div>
      <BriefTextField
        key={`bg-note-${card.background.note ?? ""}`}
        id={id("background-note")}
        label="Note sur le fond"
        value={card.background.note ?? ""}
        maxLength={120}
        onSave={edit((c, v) => ({ ...c, background: { ...c.background, note: v.trim() || undefined } }))}
      />

      {card.emotion && (
        <div className="grid grid-cols-3 gap-1.5">
          <BriefSelectField
            id={id("emotion-label")}
            label="Émotion"
            value={card.emotion.label}
            items={EMOTION_ITEMS}
            onSave={edit((c, v) => {
              const label = EMOTION_ITEMS.find((item) => item.value === v)?.value as NonNullable<Composition["emotion"]>["label"] | undefined;
              return label && c.emotion ? { ...c, emotion: { ...c.emotion, label } } : "Émotion inconnue";
            })}
          />
          <BriefSelectField
            id={id("emotion-intensity")}
            label="Intensité"
            value={String(card.emotion.intensity)}
            items={INTENSITY_ITEMS}
            onSave={edit((c, v) => {
              const intensity = v === "1" ? 1 : v === "2" ? 2 : v === "3" ? 3 : null;
              return intensity && c.emotion ? { ...c, emotion: { ...c.emotion, intensity } } : "Intensité inconnue";
            })}
          />
          <BriefSelectField
            id={id("emotion-mouth")}
            label="Bouche"
            value={card.emotion.mouth}
            items={MOUTH_ITEMS}
            onSave={edit((c, v) => (c.emotion && (v === "open" || v === "closed") ? { ...c, emotion: { ...c.emotion, mouth: v } } : "Choix inconnu"))}
          />
        </div>
      )}

      <div className="grid grid-cols-3 gap-1.5">
        {(["dominant", "accent", "highlight"] as const).map((slot) => (
          <BriefTextField
            key={`${slot}-${card.palette[slot]}`}
            id={id(`palette-${slot}`)}
            label={slot === "dominant" ? "Dominante" : slot === "accent" ? "Accent" : "Rehaut"}
            value={card.palette[slot]}
            maxLength={7}
            onSave={edit((c, v) => ({ ...c, palette: { ...c.palette, [slot]: v.trim() } }))}
          />
        ))}
      </div>
    </div>
  );
}
