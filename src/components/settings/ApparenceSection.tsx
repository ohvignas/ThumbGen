"use client";

import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { THEMES, type Theme } from "@/lib/settings-schema";
import { applyTheme } from "@/lib/theme";
import FieldError from "./FieldError";
import SettingsFormCard from "./SettingsFormCard";
import { useSettingsForm } from "./use-settings-form";

const KEYS = ["theme"] as const;

const THEME_LABELS: Record<Theme, string> = { dark: "Sombre", light: "Clair", system: "Système" };

export default function ApparenceSection() {
  // The saved theme is applied at once; the root layout renders it on the next load.
  const form = useSettingsForm(KEYS, { onSaved: (values) => applyTheme(values.theme) });

  return (
    <SettingsFormCard title="Apparence" description="Thème de l'interface." form={form}>
      {(values) => (
        <div className="grid gap-2">
          <Label>Thème</Label>
          <ToggleGroup
            variant="outline"
            aria-label="Thème"
            value={[values.theme]}
            onValueChange={(value) => {
              const next = THEMES.find((theme) => theme === value[0]);
              if (next) form.setValue("theme", next);
            }}
          >
            {THEMES.map((theme) => (
              <ToggleGroupItem key={theme} value={theme}>
                {THEME_LABELS[theme]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <p className="text-sm text-muted-foreground">Le canvas et ses nœuds restent sombres.</p>
          <FieldError message={form.issues.theme} />
        </div>
      )}
    </SettingsFormCard>
  );
}
