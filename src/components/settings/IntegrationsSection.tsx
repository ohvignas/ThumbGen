"use client";

import McpSettingsSection from "@/components/panels/settings/McpSettingsSection";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useSettings } from "./use-settings";

export default function IntegrationsSection() {
  const { settings, loadError } = useSettings();

  return (
    <>
      <Card>
        <CardContent>
          <McpSettingsSection />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Accès protégé par mot de passe</CardTitle>
          <CardDescription>Se configure via la variable d&apos;environnement SITE_PASSWORD.</CardDescription>
          <CardAction>
            {settings ? (
              <Badge variant={settings.sitePasswordEnabled ? "default" : "secondary"}>
                {settings.sitePasswordEnabled ? "Activé" : "Désactivé"}
              </Badge>
            ) : (
              <Skeleton className="h-5 w-16" />
            )}
          </CardAction>
        </CardHeader>
        {loadError && (
          <CardContent>
            <Alert variant="destructive">
              <AlertDescription>{loadError}</AlertDescription>
            </Alert>
          </CardContent>
        )}
      </Card>
    </>
  );
}
