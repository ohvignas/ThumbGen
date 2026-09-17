"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { AGENT_MODELS, getModelById } from "@/lib/agent/models";
import { LANGUAGES, REASONING_EFFORTS, type ReasoningEffort } from "@/lib/settings-schema";
import FieldError from "./FieldError";
import SettingsFormCard from "./SettingsFormCard";
import { useSettingsForm } from "./use-settings-form";

const KEYS = [
  "agentModel",
  "agentWebSearch",
  "agentReasoningEffort",
  "agentMaxSteps",
  "agentAutoTitle",
  "agentResponseLanguage",
] as const;

const MODEL_ITEMS = AGENT_MODELS.map((model) => ({
  value: model.id,
  label: `${model.label} — ${model.pricing.inputPerM} $ / ${model.pricing.outputPerM} $ par million de tokens`,
}));

const LANGUAGE_ITEMS = LANGUAGES.map((language) => ({ value: language.code, label: language.label }));

const EFFORT_LABELS: Record<ReasoningEffort, string> = { low: "Faible", medium: "Moyen", high: "Élevé" };

export default function AgentSection() {
  const form = useSettingsForm(KEYS);

  return (
    <SettingsFormCard title="Agent IA" description="Le modèle et le comportement de l'agent du chat." form={form}>
      {(values) => {
        const supportsThinking = getModelById(values.agentModel)?.supportsThinking ?? false;
        return (
          <>
            <div className="grid gap-2">
              <Label htmlFor="agent-model">Modèle</Label>
              <Select
                items={MODEL_ITEMS}
                value={values.agentModel}
                onValueChange={(value) => {
                  if (value) form.setValue("agentModel", value);
                }}
              >
                <SelectTrigger id="agent-model" className="w-full" aria-invalid={Boolean(form.issues.agentModel)}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MODEL_ITEMS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError message={form.issues.agentModel} />
            </div>

            <div className="flex items-start justify-between gap-4">
              <div className="grid gap-1">
                <Label htmlFor="agent-web-search">Recherche web automatique</Label>
                <p className="text-sm text-muted-foreground">
                  L&apos;agent consulte le web avant de répondre (variante « :online » d&apos;OpenRouter).
                </p>
              </div>
              <Switch
                id="agent-web-search"
                checked={values.agentWebSearch}
                onCheckedChange={(checked) => form.setValue("agentWebSearch", checked)}
              />
            </div>

            <div className="grid gap-2">
              <Label>Effort de réflexion</Label>
              <ToggleGroup
                variant="outline"
                aria-label="Effort de réflexion"
                disabled={!supportsThinking}
                value={[values.agentReasoningEffort]}
                onValueChange={(value) => {
                  const next = REASONING_EFFORTS.find((effort) => effort === value[0]);
                  if (next) form.setValue("agentReasoningEffort", next);
                }}
              >
                {REASONING_EFFORTS.map((effort) => (
                  <ToggleGroupItem key={effort} value={effort}>
                    {EFFORT_LABELS[effort]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <p className="text-sm text-muted-foreground">
                {supportsThinking
                  ? "Plus l'effort est élevé, plus l'agent réfléchit avant de répondre : plus lent et plus cher."
                  : "Ce modèle ne prend pas en charge la réflexion : ce réglage est ignoré tant qu'il est sélectionné."}
              </p>
              <FieldError message={form.issues.agentReasoningEffort} />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="agent-max-steps">Étapes max par réponse</Label>
              <Input
                id="agent-max-steps"
                type="number"
                min={5}
                max={50}
                step={1}
                className="w-24"
                value={Number.isFinite(values.agentMaxSteps) ? values.agentMaxSteps : ""}
                onChange={(event) => form.setValue("agentMaxSteps", event.target.valueAsNumber)}
                aria-invalid={Boolean(form.issues.agentMaxSteps)}
              />
              <p className="text-sm text-muted-foreground">
                Nombre maximal d&apos;appels d&apos;outils enchaînés par l&apos;agent dans une réponse (5 à 50).
              </p>
              <FieldError message={form.issues.agentMaxSteps} />
            </div>

            <div className="flex items-start justify-between gap-4">
              <div className="grid gap-1">
                <Label htmlFor="agent-auto-title">Titre automatique des conversations</Label>
                <p className="text-sm text-muted-foreground">
                  Nomme chaque nouvelle conversation d&apos;après ton premier message.
                </p>
              </div>
              <Switch
                id="agent-auto-title"
                checked={values.agentAutoTitle}
                onCheckedChange={(checked) => form.setValue("agentAutoTitle", checked)}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="agent-language">Langue des réponses</Label>
              <Select
                items={LANGUAGE_ITEMS}
                value={values.agentResponseLanguage}
                onValueChange={(value) => {
                  const next = LANGUAGE_ITEMS.find((item) => item.value === value);
                  if (next) form.setValue("agentResponseLanguage", next.value);
                }}
              >
                <SelectTrigger id="agent-language" className="w-full sm:w-64">
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
              <FieldError message={form.issues.agentResponseLanguage} />
            </div>
          </>
        );
      }}
    </SettingsFormCard>
  );
}
