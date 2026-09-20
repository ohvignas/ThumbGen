"use client";

import { useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import type { YoutubeConnectionPublic } from "@/lib/youtube/connection-types";
import ConfirmDialog from "./ConfirmDialog";

const STEP_LABEL: Record<string, string> = {
  videos: "Import des vidéos",
  analytics: "Statistiques YouTube Studio",
  transcripts: "Transcriptions",
  analysis: "Analyse de la chaîne",
  done: "Terminé",
};

const ERROR_REASON: Record<string, string> = {
  session: "La session de connexion a expiré. Réessaie.",
  access_denied: "Tu as refusé l'accès Google.",
  code: "Google n'a pas renvoyé de code.",
  client: "Configure d'abord le client OAuth dans Connexions.",
  refresh: "Google n'a pas renvoyé de jeton durable. Révoque ThumbGen dans ton compte Google puis reconnecte.",
  token: "L'échange de jeton Google a échoué.",
};

export default function YoutubeConnectCard() {
  const [connection, setConnection] = useState<YoutubeConnectionPublic | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [youtubeParam, setYoutubeParam] = useState<string | null>(null);
  const [reason, setReason] = useState<string | null>(null);

  const reload = async () => {
    try {
      const res = await fetch("/api/youtube/connection", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      setConnection((await res.json()) as YoutubeConnectionPublic);
      setLoadError(null);
    } catch {
      setLoadError("Impossible de lire l'état YouTube.");
    }
  };

  useEffect(() => {
    void reload();
    const params = new URLSearchParams(window.location.search);
    setYoutubeParam(params.get("youtube"));
    setReason(params.get("reason"));
    if (params.has("youtube") || params.has("reason")) {
      params.delete("youtube");
      params.delete("reason");
      const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}${window.location.hash}`;
      window.history.replaceState(null, "", next);
    }
  }, []);

  useEffect(() => {
    if (connection?.ingest.status !== "running") return;
    const timer = window.setInterval(() => void reload(), 2000);
    return () => window.clearInterval(timer);
  }, [connection?.ingest.status]);

  const ingest = connection?.ingest;
  const running = ingest?.status === "running";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connexion YouTube</CardTitle>
        <CardDescription>
          Import des vidéos longues, transcriptions, puis un document de chaîne pour l&apos;agent et le MCP. Ta clé
          YouTube Data API suffit. Connecter Google n&apos;est utile que pour les stats Studio.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {loadError && (
          <Alert variant="destructive">
            <AlertDescription>{loadError}</AlertDescription>
          </Alert>
        )}
        {youtubeParam === "error" && (
          <Alert variant="destructive">
            <AlertDescription>{ERROR_REASON[reason ?? ""] ?? "La connexion Google a échoué."}</AlertDescription>
          </Alert>
        )}
        {youtubeParam === "connected" && !running && ingest?.status !== "error" && (
          <Alert>
            <AlertDescription>Compte Google connecté. L&apos;import de la chaîne tourne en arrière-plan.</AlertDescription>
          </Alert>
        )}
        {connection && !connection.oauthConfigured && !connection.canIngest && (
          <Alert>
            <AlertDescription>
              Ajoute la clé YouTube Data API dans{" "}
              <a className="underline underline-offset-4" href="/reglages/connexions">
                Réglages → Connexions
              </a>{" "}
              et l&apos;URL de ta chaîne ci-dessous.
            </AlertDescription>
          </Alert>
        )}
        {connection && connection.canIngest && !connection.oauthConfigured && !connection.connected && (
          <Alert>
            <AlertDescription>
              La clé YouTube déjà enregistrée dans Connexions va importer tes vidéos publiques. Google OAuth reste
              optionnel pour les statistiques Studio.
            </AlertDescription>
          </Alert>
        )}
        {connection?.connected && (
          <div className="grid gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium">{connection.channelTitle ?? "Chaîne YouTube"}</p>
              {connection.channelHandle && <Badge variant="secondary">{connection.channelHandle}</Badge>}
              {running && <Spinner />}
            </div>
            {ingest && (
              <ul className="grid gap-1 text-sm text-muted-foreground">
                <li>
                  Vidéos : {ingest.videosDone}
                  {ingest.videosTotal ? ` / ${ingest.videosTotal}` : ""}
                </li>
                <li>
                  Transcriptions : {ingest.transcriptsDone} ok
                  {ingest.transcriptsFailed ? ` · ${ingest.transcriptsFailed} sans sous-titres` : ""}
                </li>
                <li>Étape : {STEP_LABEL[ingest.step ?? ""] ?? (running ? "Démarrage…" : "En attente")}</li>
                {ingest.lastIngestAt && !running && (
                  <li>Dernière analyse : {new Date(ingest.lastIngestAt).toLocaleString("fr-FR")}</li>
                )}
              </ul>
            )}
            {ingest?.error && (
              <Alert variant="destructive">
                <AlertDescription>{ingest.error}</AlertDescription>
              </Alert>
            )}
          </div>
        )}
      </CardContent>
      <CardFooter className="gap-3">
        {!connection?.connected ? (
          <>
            <Button
              type="button"
              disabled={!connection?.canIngest || busy}
              onClick={async () => {
                setBusy(true);
                await fetch("/api/youtube/ingest", { method: "POST" });
                await reload();
                setBusy(false);
              }}
            >
              Importer ma chaîne
            </Button>
            {connection?.oauthConfigured && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  window.location.href = "/api/youtube/oauth/start";
                }}
              >
                Connecter Google (stats Studio)
              </Button>
            )}
          </>
        ) : (
          <>
            <Button
              type="button"
              variant="outline"
              disabled={busy || running}
              onClick={async () => {
                setBusy(true);
                await fetch("/api/youtube/ingest", { method: "POST" });
                await reload();
                setBusy(false);
              }}
            >
              Relancer l&apos;analyse
            </Button>
            <Button type="button" variant="ghost" onClick={() => setDisconnectOpen(true)}>
              Déconnecter
            </Button>
          </>
        )}
      </CardFooter>
      <ConfirmDialog
        open={disconnectOpen}
        onOpenChange={setDisconnectOpen}
        title="Déconnecter YouTube ?"
        description="La connexion YouTube est oubliée. Les vidéos déjà importées restent dans la bibliothèque."
        confirmLabel="Déconnecter"
        onConfirm={async () => {
          await fetch("/api/youtube/oauth/disconnect", { method: "POST" });
          await reload();
          setDisconnectOpen(false);
        }}
      />
    </Card>
  );
}
