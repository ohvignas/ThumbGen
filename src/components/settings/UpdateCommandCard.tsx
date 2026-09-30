"use client";

import { useState } from "react";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { THUMBGEN_UPDATE_COMMAND } from "@/lib/update-command";

export default function UpdateCommandCard() {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(THUMBGEN_UPDATE_COMMAND);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Mettre à jour ThumbGen</CardTitle>
        <CardDescription>
          Pas de bouton magique dans le navigateur : l&apos;app n&apos;a pas le droit de lancer git ou Docker sur
          l&apos;hôte. Dans le dossier du dépôt (celui qui contient <code className="font-mono">docker-compose.yml</code>
          ) :
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <pre className="overflow-x-auto rounded-lg bg-muted p-3 font-mono text-xs whitespace-pre">
          {THUMBGEN_UPDATE_COMMAND}
        </pre>
        <Button type="button" variant="outline" onClick={() => void copy()}>
          <Copy />
          {copied ? "Copié" : "Copier la commande"}
        </Button>
      </CardContent>
    </Card>
  );
}
