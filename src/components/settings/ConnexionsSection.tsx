"use client";

import { Alert, AlertDescription } from "@/components/ui/alert";
import SecretKeyCard, { type ProviderKeyConfig } from "./SecretKeyCard";
import { useSettings } from "./use-settings";

const PROVIDERS: ProviderKeyConfig[] = [
  {
    key: "openrouterApiKey",
    provider: "openrouter",
    title: "OpenRouter",
    usage: "Requise. Génère les images, fait tourner l'agent et améliore les prompts.",
    placeholder: "sk-or-v1-…",
    helpHref: "https://openrouter.ai/keys",
  },
  {
    key: "openaiApiKey",
    provider: "openai",
    title: "OpenAI",
    usage: "Utilisée uniquement pour la dictée vocale du chat.",
    placeholder: "sk-…",
    helpHref: "https://platform.openai.com/api-keys",
  },
  {
    key: "youtubeApiKey",
    provider: "youtube",
    title: "YouTube Data API",
    usage: "Recherche de vidéos et de miniatures par l'agent, flux d'inspirations.",
    placeholder: "AIza…",
    helpHref: "https://console.cloud.google.com/apis/credentials",
  },
];

export default function ConnexionsSection() {
  const { settings, loadError, reload } = useSettings();

  return (
    <>
      {loadError && (
        <Alert variant="destructive">
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}
      {PROVIDERS.map((config) => (
        <SecretKeyCard
          key={config.key}
          config={config}
          status={settings ? settings[config.key] : null}
          onChanged={reload}
        />
      ))}
    </>
  );
}
