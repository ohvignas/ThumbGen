"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { YoutubeConnectionPublic } from "@/lib/youtube/connection-types";

export default function ChannelKnowledgeCard() {
  const [connection, setConnection] = useState<YoutubeConnectionPublic | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const res = await fetch("/api/youtube/connection", { cache: "no-store" });
      if (!res.ok || cancelled) return;
      const body = (await res.json()) as YoutubeConnectionPublic;
      if (!cancelled) setConnection(body);
    };
    void load();
    const timer = window.setInterval(() => void load(), 4000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const document = connection?.knowledge?.documentMd ?? null;
  const running = connection?.ingest.status === "running";
  if (!connection?.connected && !document) return null;

  const meta = connection?.knowledge
    ? `${connection.knowledge.videoCount} vidéos · ${connection.knowledge.transcriptCount} transcriptions · ${new Date(connection.knowledge.generatedAt).toLocaleString("fr-FR")}`
    : running
      ? "L'analyse tourne : le document apparaîtra ici."
      : "Lance l'analyse après la connexion Google pour produire ce document.";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Document de chaîne</CardTitle>
        <CardDescription>
          Produit après l&apos;analyse. L&apos;agent et le MCP s&apos;en servent pour coller à ta chaîne. {meta}
        </CardDescription>
      </CardHeader>
      {document ? (
        <CardContent>
          <pre className="max-h-128 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-4 text-sm">{document}</pre>
        </CardContent>
      ) : null}
    </Card>
  );
}
