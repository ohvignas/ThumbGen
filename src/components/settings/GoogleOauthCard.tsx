"use client";

import { useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SecretStatus, SettingsIssue } from "@/lib/settings-schema";
import ConfirmDialog from "./ConfirmDialog";
import FieldError from "./FieldError";
import { describeSecretStatus } from "./secret-status";

export default function GoogleOauthCard({
  clientId,
  secretStatus,
  onChanged,
}: {
  clientId: string;
  secretStatus: SecretStatus | null;
  onChanged: () => Promise<unknown>;
}) {
  const [idValue, setIdValue] = useState(clientId);
  const [secretValue, setSecretValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<Record<string, string>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [redirectUri, setRedirectUri] = useState("");

  useEffect(() => {
    setIdValue(clientId);
  }, [clientId]);

  useEffect(() => {
    setRedirectUri(`${window.location.origin}/api/youtube/oauth/callback`);
  }, []);

  const dirty = idValue.trim() !== clientId || Boolean(secretValue.trim());
  const badge = secretStatus ? describeSecretStatus(secretStatus) : null;

  const save = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    setError(null);
    setIssues({});
    try {
      const body: Record<string, string> = { googleOAuthClientId: idValue.trim() };
      if (secretValue.trim()) body.googleOAuthClientSecret = secretValue.trim();
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 400) {
        const payload = (await res.json().catch(() => ({}))) as { error?: string; issues?: SettingsIssue[] };
        const next: Record<string, string> = {};
        for (const issue of payload.issues ?? []) next[issue.path] = issue.message;
        setIssues(next);
        if (!payload.issues?.length) setError(payload.error ?? "Enregistrement refusé.");
        return;
      }
      if (!res.ok) {
        setError(`Échec de l'enregistrement (HTTP ${res.status}).`);
        return;
      }
      setSecretValue("");
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2000);
      await onChanged();
    } catch {
      setError("Impossible d'enregistrer.");
    } finally {
      setSaving(false);
    }
  };

  const removeSecret = async () => {
    const res = await fetch("/api/settings?key=googleOAuthClientSecret", { method: "DELETE" });
    if (!res.ok) setError("Impossible de supprimer le secret.");
    else await onChanged();
    setConfirmOpen(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Google — YouTube (OAuth)</CardTitle>
        <CardDescription>
          Client OAuth d&apos;une application Web dans Google Cloud, avec les APIs YouTube Data et YouTube Analytics
          activées. Sert à connecter ta chaîne dans Réglages → Ma chaîne.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <div className="grid gap-2">
          <Label htmlFor="google-oauth-client-id">ID client</Label>
          <Input
            id="google-oauth-client-id"
            value={idValue}
            onChange={(event) => setIdValue(event.target.value)}
            placeholder="….apps.googleusercontent.com"
            autoComplete="off"
          />
          <FieldError message={issues.googleOAuthClientId} />
        </div>
        <div className="grid gap-2">
          <div className="flex items-center gap-2">
            <Label htmlFor="google-oauth-secret">Secret client</Label>
            {badge && <Badge variant="secondary">{badge.label}</Badge>}
          </div>
          <Input
            id="google-oauth-secret"
            type="password"
            value={secretValue}
            onChange={(event) => setSecretValue(event.target.value)}
            placeholder="GOCSPX-…"
            autoComplete="off"
          />
          <FieldError message={issues.googleOAuthClientSecret} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="google-oauth-redirect">URI de redirection autorisée</Label>
          <Input id="google-oauth-redirect" readOnly value={redirectUri} />
          <p className="text-sm text-muted-foreground">
            Colle cette URI dans Google Cloud → Identifiants → ton client OAuth. Ajoute aussi{" "}
            <a
              className="underline underline-offset-4"
              href="https://console.cloud.google.com/apis/library/youtube.googleapis.com"
              target="_blank"
              rel="noreferrer"
            >
              YouTube Data API
            </a>{" "}
            et{" "}
            <a
              className="underline underline-offset-4"
              href="https://console.cloud.google.com/apis/library/youtubeanalytics.googleapis.com"
              target="_blank"
              rel="noreferrer"
            >
              YouTube Analytics API
            </a>
            . En mode test, ajoute ton compte Google comme utilisateur de test : Google expire le jeton au bout de
            7 jours, il faudra reconnecter Ma chaîne.
          </p>
        </div>
      </CardContent>
      <CardFooter className="gap-3">
        <Button type="button" disabled={!dirty || saving} onClick={() => void save()}>
          {saving ? "Enregistrement…" : "Enregistrer"}
        </Button>
        {secretStatus?.configured && secretStatus.source === "settings" && (
          <Button type="button" variant="ghost" onClick={() => setConfirmOpen(true)}>
            Supprimer le secret
          </Button>
        )}
        {saved && <span className="text-sm text-muted-foreground">Enregistré</span>}
      </CardFooter>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Supprimer le secret Google ?"
        description="Tu pourras le recoller ensuite. La connexion YouTube déjà établie reste jusqu'à déconnexion."
        confirmLabel="Supprimer"
        onConfirm={() => void removeSecret()}
      />
    </Card>
  );
}
