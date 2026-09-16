"use client";

import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { BRAND_COLOR_PATTERN, type ChannelProfile } from "@/lib/settings-schema";
import FieldError from "./FieldError";
import SettingsFormCard from "./SettingsFormCard";
import { useSettingsForm } from "./use-settings-form";

const KEYS = ["youtubePlaylistId", "channelProfile"] as const;
const NO_PERSONA = "__none__";
const MAX_BRAND_COLORS = 3;
const NEW_BRAND_COLOR = "#E6007E";

type PersonaOption = { id: string; label: string };

export default function ChaineSection() {
  // AppSidebar stays mounted across every /reglages section and only
  // refetches the Inspirations feed on its own 5-minute timer, so saving the
  // YouTube channel here would otherwise leave that feed stale for up to
  // 5 minutes. Every save from this form includes youtubePlaylistId (it's
  // always in KEYS), so nudge the sidebar to refresh right away.
  const form = useSettingsForm(KEYS, {
    onSaved: () => window.dispatchEvent(new Event("youtube-channel-saved")),
  });
  const [personas, setPersonas] = useState<PersonaOption[] | null>(null);

  useEffect(() => {
    fetch("/api/personas")
      .then((res) => (res.ok ? (res.json() as Promise<PersonaOption[]>) : []))
      .then((list) => setPersonas(list.map((persona) => ({ id: persona.id, label: persona.label }))))
      .catch(() => setPersonas([]));
  }, []);

  return (
    <SettingsFormCard
      title="Ma chaîne"
      description="Le profil de ta chaîne, transmis à l'agent à chaque conversation."
      form={form}
    >
      {(values) => {
        const profile = values.channelProfile;
        const setProfile = (patch: Partial<ChannelProfile>) => form.setValue("channelProfile", { ...profile, ...patch });
        const setColor = (index: number, color: string) =>
          setProfile({ brandColors: profile.brandColors.map((current, i) => (i === index ? color : current)) });

        const personaItems = [
          { value: NO_PERSONA, label: "Aucun" },
          ...(personas ?? []).map((persona) => ({ value: persona.id, label: persona.label })),
        ];
        if (profile.defaultPersonaId && !personaItems.some((item) => item.value === profile.defaultPersonaId)) {
          personaItems.push({
            value: profile.defaultPersonaId,
            label: personas === null ? "Chargement…" : "Personnage supprimé",
          });
        }

        const colorIssue =
          form.issues["channelProfile.brandColors"] ??
          profile.brandColors.map((_, index) => form.issues[`channelProfile.brandColors.${index}`]).find(Boolean);

        return (
          <>
            <div className="grid gap-2">
              <Label htmlFor="channel-name">Nom de la chaîne</Label>
              <Input
                id="channel-name"
                maxLength={100}
                value={profile.name}
                onChange={(event) => setProfile({ name: event.target.value })}
                aria-invalid={Boolean(form.issues["channelProfile.name"])}
              />
              <FieldError message={form.issues["channelProfile.name"]} />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="channel-youtube">Chaîne YouTube</Label>
              <Input
                id="channel-youtube"
                placeholder="https://youtube.com/@votrechaine"
                value={values.youtubePlaylistId}
                onChange={(event) => form.setValue("youtubePlaylistId", event.target.value)}
                aria-invalid={Boolean(form.issues.youtubePlaylistId)}
              />
              <p className="text-sm text-muted-foreground">
                URL de la chaîne, @handle ou id de playlist. Alimente aussi le flux d&apos;inspirations.
              </p>
              <FieldError message={form.issues.youtubePlaylistId} />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="channel-niche">Thématique / niche</Label>
              <Input
                id="channel-niche"
                maxLength={200}
                value={profile.niche}
                onChange={(event) => setProfile({ niche: event.target.value })}
                aria-invalid={Boolean(form.issues["channelProfile.niche"])}
              />
              <FieldError message={form.issues["channelProfile.niche"]} />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="channel-audience">Public cible</Label>
              <Textarea
                id="channel-audience"
                maxLength={500}
                rows={3}
                value={profile.audience}
                onChange={(event) => setProfile({ audience: event.target.value })}
                aria-invalid={Boolean(form.issues["channelProfile.audience"])}
              />
              <FieldError message={form.issues["channelProfile.audience"]} />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="channel-tone">Ton et style</Label>
              <Textarea
                id="channel-tone"
                maxLength={500}
                rows={3}
                value={profile.tone}
                onChange={(event) => setProfile({ tone: event.target.value })}
                aria-invalid={Boolean(form.issues["channelProfile.tone"])}
              />
              <FieldError message={form.issues["channelProfile.tone"]} />
            </div>

            <div className="grid gap-2">
              <Label>Couleurs de marque</Label>
              {profile.brandColors.map((color, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input
                    type="color"
                    aria-label={`Couleur ${index + 1}`}
                    className="h-8 w-12 cursor-pointer p-1"
                    value={BRAND_COLOR_PATTERN.test(color) ? color : "#000000"}
                    onChange={(event) => setColor(index, event.target.value.toUpperCase())}
                  />
                  <Input
                    aria-label={`Code hexadécimal de la couleur ${index + 1}`}
                    className="w-32 font-mono"
                    maxLength={7}
                    value={color}
                    onChange={(event) => setColor(index, event.target.value)}
                    aria-invalid={Boolean(form.issues[`channelProfile.brandColors.${index}`])}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Retirer la couleur ${index + 1}`}
                    onClick={() => setProfile({ brandColors: profile.brandColors.filter((_, i) => i !== index) })}
                  >
                    <X />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-fit"
                disabled={profile.brandColors.length >= MAX_BRAND_COLORS}
                onClick={() => setProfile({ brandColors: [...profile.brandColors, NEW_BRAND_COLOR] })}
              >
                <Plus />
                Ajouter une couleur
              </Button>
              <p className="text-sm text-muted-foreground">Jusqu&apos;à 3 couleurs, au format #RRGGBB.</p>
              <FieldError message={colorIssue} />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="channel-persona">Personnage par défaut</Label>
              <Select
                items={personaItems}
                value={profile.defaultPersonaId ?? NO_PERSONA}
                onValueChange={(value) => setProfile({ defaultPersonaId: !value || value === NO_PERSONA ? null : value })}
              >
                <SelectTrigger
                  id="channel-persona"
                  className="w-full sm:w-64"
                  aria-invalid={Boolean(form.issues["channelProfile.defaultPersonaId"])}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {personaItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                L&apos;agent l&apos;utilise comme visage de référence sauf si tu demandes autre chose.
              </p>
              <FieldError message={form.issues["channelProfile.defaultPersonaId"]} />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="channel-instructions">Consignes pour l&apos;agent</Label>
              <Textarea
                id="channel-instructions"
                maxLength={2000}
                rows={5}
                value={profile.agentInstructions}
                onChange={(event) => setProfile({ agentInstructions: event.target.value })}
                aria-invalid={Boolean(form.issues["channelProfile.agentInstructions"])}
              />
              <p className="text-sm text-muted-foreground">
                Habitudes de la chaîne, choses à éviter, style de titres… (2000 caractères maximum).
              </p>
              <FieldError message={form.issues["channelProfile.agentInstructions"]} />
            </div>
          </>
        );
      }}
    </SettingsFormCard>
  );
}
