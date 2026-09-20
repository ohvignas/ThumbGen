"use client";

import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import type { ConnectionTestResult, TestableProvider } from "@/lib/connection-tests";
import { ENV_FALLBACK, type SecretStatus, type SettingsIssue } from "@/lib/settings-schema";
import ConfirmDialog from "./ConfirmDialog";
import FieldError from "./FieldError";
import { describeSecretStatus } from "./secret-status";

export type ProviderKeyConfig = {
  key: "openrouterApiKey" | "openaiApiKey" | "youtubeApiKey" | "brandfetchApiKey" | "perplexityApiKey" | "typesafeApiKey";
  provider: TestableProvider;
  title: string;
  usage: string;
  placeholder: string;
  helpHref: string;
  /** Text of the help link, « Obtenir une clé » when absent. */
  helpLabel?: string;
};

export default function SecretKeyCard({
  config,
  status,
  onChanged,
}: {
  config: ProviderKeyConfig;
  status: SecretStatus | null;
  onChanged: () => Promise<unknown>;
}) {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const envName = ENV_FALLBACK[config.key];
  const inputId = `secret-${config.key}`;
  const badge = status ? describeSecretStatus(status) : null;

  const save = async () => {
    if (!value.trim() || saving) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    setFieldError(undefined);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [config.key]: value.trim() }),
      });
      if (res.status === 400) {
        const body = (await res.json().catch(() => ({}))) as { error?: string; issues?: SettingsIssue[] };
        const issue = body.issues?.find((item) => item.path === config.key);
        if (issue) setFieldError(issue.message);
        else setError(body.error ?? "Clé refusée.");
        return;
      }
      if (!res.ok) {
        setError(`Échec de l'enregistrement (HTTP ${res.status}).`);
        return;
      }
      // The secret never stays in the page once saved.
      setValue("");
      setTestResult(null);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2000);
      await onChanged();
    } catch {
      setError("Échec de l'enregistrement — vérifie ta connexion.");
    } finally {
      setSaving(false);
    }
  };

  const runTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`/api/settings/test?provider=${config.provider}`, { method: "POST" });
      setTestResult((await res.json()) as ConnectionTestResult);
    } catch {
      setTestResult({ ok: false, detail: "Test impossible — vérifie ta connexion." });
    } finally {
      setTesting(false);
    }
  };

  const remove = async () => {
    setDeleting(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/settings?key=${config.key}`, { method: "DELETE" });
      if (!res.ok) {
        setError(`Suppression impossible (HTTP ${res.status}).`);
        return;
      }
      const after = (await res.json()) as SecretStatus;
      if (after.source === "env") {
        setNotice(
          `La clé enregistrée est supprimée, mais la variable d'environnement ${envName} en fournit encore une : elle ne peut pas être effacée depuis cette page.`,
        );
      }
      setTestResult(null);
      setConfirmOpen(false);
      await onChanged();
    } catch {
      setError("Suppression impossible — vérifie ta connexion.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Card>
      <form
        className="contents"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <CardHeader>
          <CardTitle>{config.title}</CardTitle>
          <CardDescription>{config.usage}</CardDescription>
          <CardAction>
            {badge ? <Badge variant={badge.variant}>{badge.label}</Badge> : <Skeleton className="h-5 w-24" />}
          </CardAction>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor={inputId}>{status?.configured ? "Remplacer la clé" : "Clé API"}</Label>
            <Input
              id={inputId}
              type="password"
              autoComplete="off"
              placeholder={config.placeholder}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              aria-invalid={Boolean(fieldError)}
            />
            <FieldError message={fieldError} />
            <a
              href={config.helpHref}
              target="_blank"
              rel="noopener noreferrer"
              className="w-fit text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              {config.helpLabel ?? "Obtenir une clé"}
            </a>
          </div>
          {status?.source === "env" && (
            <p className="text-sm text-muted-foreground">
              Cette clé vient de la variable d&apos;environnement {envName} : elle ne peut pas être effacée depuis cette page.
            </p>
          )}
          {testResult && (
            <Alert variant={testResult.ok ? "default" : "destructive"}>
              <AlertDescription>{testResult.detail}</AlertDescription>
            </Alert>
          )}
          {notice && (
            <Alert>
              <AlertDescription>{notice}</AlertDescription>
            </Alert>
          )}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
        <CardFooter className="flex-wrap gap-2">
          <Button type="submit" disabled={!value.trim() || saving}>
            {saving ? "Enregistrement…" : "Enregistrer"}
          </Button>
          <Button type="button" variant="outline" disabled={!status?.configured || testing} onClick={() => void runTest()}>
            {testing ? "Test en cours…" : "Tester"}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={status?.source !== "settings" || deleting}
            onClick={() => setConfirmOpen(true)}
          >
            Supprimer la clé
          </Button>
          {saved && <span className="text-sm text-muted-foreground">Enregistré</span>}
        </CardFooter>
      </form>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Supprimer la clé ${config.title} ?`}
        description="Les fonctions qui l'utilisent cesseront de marcher jusqu'à l'enregistrement d'une nouvelle clé."
        confirmLabel="Supprimer la clé"
        busy={deleting}
        onConfirm={() => void remove()}
      />
    </Card>
  );
}
