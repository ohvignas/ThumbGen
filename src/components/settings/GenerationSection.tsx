"use client";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { IMAGE_MODEL_GROUPS, IMAGE_MODELS } from "@/lib/image-models";
import { ASPECT_RATIOS, IMAGE_RESOLUTIONS, LANGUAGES, type AspectRatio } from "@/lib/settings-schema";
import { CLASSIFY_MODEL_LABEL, estimateClassificationCostUsd } from "@/lib/youtube/classification-pricing";
import FieldError from "./FieldError";
import SettingsFormCard from "./SettingsFormCard";
import { useSettingsForm } from "./use-settings-form";

const KEYS = [
  "favoriteModel",
  "defaultAspectRatio",
  "defaultImageCount",
  "defaultResolution",
  "language",
  "inspirationAutoClassify",
] as const;

const CLASSIFY_COST_PER_THOUSAND = `${estimateClassificationCostUsd(1000).toFixed(2).replace(".", ",")} $`;

const MODEL_ITEMS = IMAGE_MODELS.map((model) => ({ value: model.id, label: model.label }));
const LANGUAGE_ITEMS = LANGUAGES.map((language) => ({ value: language.code, label: language.label }));
const ASPECT_LABELS: Record<AspectRatio, string> = { "16x9": "16:9", "9x16": "9:16", "1x1": "1:1" };
const IMAGE_COUNTS = [1, 2, 3, 4] as const;

export default function GenerationSection() {
  const form = useSettingsForm(KEYS);

  return (
    <SettingsFormCard
      title="Génération d'images"
      description="Réglages de départ des nœuds Générateur créés depuis le canvas. Les workflows posés par l'agent gardent leurs propres choix."
      form={form}
    >
      {(values) => (
        <>
          <div className="grid gap-2">
            <Label htmlFor="generation-model">Modèle par défaut</Label>
            <Select
              items={MODEL_ITEMS}
              value={values.favoriteModel}
              onValueChange={(value) => {
                if (value) form.setValue("favoriteModel", value);
              }}
            >
              <SelectTrigger id="generation-model" className="w-full sm:w-80" aria-invalid={Boolean(form.issues.favoriteModel)}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {IMAGE_MODEL_GROUPS.map((group) => (
                  <SelectGroup key={group}>
                    <SelectLabel>{group}</SelectLabel>
                    {IMAGE_MODELS.filter((model) => model.group === group).map((model) => (
                      <SelectItem key={model.id} value={model.id}>
                        {model.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              L&apos;étoile d&apos;un nœud Générateur modifie aussi ce réglage.
            </p>
            <FieldError message={form.issues.favoriteModel} />
          </div>

          <div className="grid gap-2">
            <Label>Format par défaut</Label>
            <ToggleGroup
              variant="outline"
              aria-label="Format par défaut"
              value={[values.defaultAspectRatio]}
              onValueChange={(value) => {
                const next = ASPECT_RATIOS.find((ratio) => ratio === value[0]);
                if (next) form.setValue("defaultAspectRatio", next);
              }}
            >
              {ASPECT_RATIOS.map((ratio) => (
                <ToggleGroupItem key={ratio} value={ratio}>
                  {ASPECT_LABELS[ratio]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <FieldError message={form.issues.defaultAspectRatio} />
          </div>

          <div className="grid gap-2">
            <Label>Nombre d&apos;images par défaut</Label>
            <ToggleGroup
              variant="outline"
              aria-label="Nombre d'images par défaut"
              value={[String(values.defaultImageCount)]}
              onValueChange={(value) => {
                const next = IMAGE_COUNTS.find((count) => String(count) === value[0]);
                if (next) form.setValue("defaultImageCount", next);
              }}
            >
              {IMAGE_COUNTS.map((count) => (
                <ToggleGroupItem key={count} value={String(count)}>
                  {count}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <FieldError message={form.issues.defaultImageCount} />
          </div>

          <div className="grid gap-2">
            <Label>Résolution par défaut</Label>
            <ToggleGroup
              variant="outline"
              aria-label="Résolution par défaut"
              value={[values.defaultResolution]}
              onValueChange={(value) => {
                const next = IMAGE_RESOLUTIONS.find((size) => size === value[0]);
                if (next) form.setValue("defaultResolution", next);
              }}
            >
              {IMAGE_RESOLUTIONS.map((size) => (
                <ToggleGroupItem key={size} value={size}>
                  {size}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <p className="text-sm text-muted-foreground">
              Aussi utilisée par les nœuds qui n&apos;ont pas choisi leur propre résolution.
            </p>
            <FieldError message={form.issues.defaultResolution} />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="generation-language">Langue du texte sur les miniatures</Label>
            <Select
              items={LANGUAGE_ITEMS}
              value={values.language}
              onValueChange={(value) => {
                const next = LANGUAGE_ITEMS.find((item) => item.value === value);
                if (next) form.setValue("language", next.value);
              }}
            >
              <SelectTrigger id="generation-language" className="w-full sm:w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGE_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              Utilisée par « Améliorer le prompt » et par l&apos;agent pour le texte placé sur les miniatures.
            </p>
            <FieldError message={form.issues.language} />
          </div>

          <div className="flex items-start justify-between gap-4">
            <div className="grid gap-1">
              <Label htmlFor="generation-auto-classify">Classer automatiquement les miniatures (IA)</Label>
              <p className="text-sm text-muted-foreground">
                Range les miniatures des chaînes suivies par type avec {CLASSIFY_MODEL_LABEL} (environ{" "}
                {CLASSIFY_COST_PER_THOUSAND} pour 1 000 miniatures). Une correction faite à la main n&apos;est jamais
                remplacée.
              </p>
            </div>
            <Switch
              id="generation-auto-classify"
              checked={values.inspirationAutoClassify}
              onCheckedChange={(checked) => form.setValue("inspirationAutoClassify", checked)}
            />
          </div>
        </>
      )}
    </SettingsFormCard>
  );
}
