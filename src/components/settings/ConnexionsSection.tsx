"use client";

import { useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import SecretKeyCard, { type ProviderKeyConfig } from "./SecretKeyCard";
import GoogleOauthCard from "./GoogleOauthCard";
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
  {
    key: "brandfetchApiKey",
    provider: "brandfetch",
    title: "Brandfetch",
    usage:
      "Optionnelle. Ajoute les logos Brandfetch à la recherche de la Bibliothèque : colle le « Client ID » de ton compte développeur gratuit. Sans clé, la recherche utilise Simple Icons, SVGL et Wikimedia.",
    placeholder: "Client ID",
    helpHref: "https://developers.brandfetch.com/register",
    helpLabel: "Obtenir une clé gratuite",
  },
];

export default function ConnexionsSection() {
  const { settings, loadError, reload } = useSettings();
  const [needClient, setNeedClient] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("youtube") !== "need-client") return;
    setNeedClient(true);
    params.delete("youtube");
    const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}${window.location.hash}`;
    window.history.replaceState(null, "", next);
  }, []);

  return (
    <>
      {loadError && (
        <Alert variant="destructive">
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}
      {needClient && (
        <Alert>
          <AlertDescription>
            Pour connecter ta chaîne, enregistre d&apos;abord l&apos;ID client et le secret Google ci-dessous, puis
            reviens dans Réglages → Ma chaîne.
          </AlertDescription>
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
      <GoogleOauthCard
        clientId={settings?.googleOAuthClientId ?? ""}
        secretStatus={settings ? settings.googleOAuthClientSecret : null}
        onChanged={reload}
      />
    </>
  );
}
