"use client";

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Tv } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type PlaylistItem = { videoId: string; title: string; thumbnailUrl: string; addedAt: string };
type PlaylistResponse = { items?: PlaylistItem[]; configured?: boolean; error?: string };
type FeedState =
  | { status: "loading" }
  | { status: "unconfigured" }
  | { status: "error" }
  | { status: "ready"; items: PlaylistItem[] };

/**
 * « Chaînes suivies » of the Inspirations tab. Until chantier D ships it, the
 * section shows the read-only « Ma chaîne » feed that used to live in the sidebar.
 */
export default function FollowedChannelsSection() {
  const [feed, setFeed] = useState<FeedState>({ status: "loading" });

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/youtube/playlist", { cache: "no-store" });
      const body = (await res.json()) as PlaylistResponse;
      if (body.configured === false) setFeed({ status: "unconfigured" });
      else if (body.error || !res.ok) setFeed({ status: "error" });
      else setFeed({ status: "ready", items: body.items ?? [] });
    } catch {
      setFeed({ status: "error" });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Saving « Ma chaîne » in Réglages (ChaineSection) dispatches this event.
  useEffect(() => {
    const handler = () => {
      void load();
    };
    window.addEventListener("youtube-channel-saved", handler);
    return () => window.removeEventListener("youtube-channel-saved", handler);
  }, [load]);

  return (
    <section className="grid gap-4">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="font-heading text-lg font-medium">Chaînes suivies</h2>
          <Badge variant="secondary">Bientôt</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Bientôt : suis ta chaîne et d&apos;autres chaînes, avec les vues et les miniatures qui marchent. En attendant, voici
          les vidéos de ta chaîne.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Tv className="size-4" />
            Ma chaîne
          </CardTitle>
          <CardDescription>Lecture seule. La chaîne se règle dans Réglages → Ma chaîne.</CardDescription>
        </CardHeader>
        <CardContent>
          {feed.status === "loading" && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[0, 1, 2, 3].map((index) => (
                <Skeleton key={index} className="aspect-video w-full rounded-lg" />
              ))}
            </div>
          )}
          {feed.status === "unconfigured" && (
            <p className="text-sm text-muted-foreground">
              Ajoute ta clé YouTube et ta chaîne pour voir tes vidéos ici :{" "}
              <Link href="/reglages/chaine" className="underline underline-offset-4 hover:text-foreground">
                Réglages → Ma chaîne
              </Link>
              .
            </p>
          )}
          {feed.status === "error" && (
            <p className="text-sm text-destructive">Impossible de charger les vidéos de ta chaîne pour l&apos;instant.</p>
          )}
          {feed.status === "ready" && feed.items.length === 0 && (
            <p className="text-sm text-muted-foreground">Aucune vidéo trouvée sur ta chaîne.</p>
          )}
          {feed.status === "ready" && feed.items.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {feed.items.map((item) => (
                <figure key={item.videoId} className="grid gap-1.5">
                  <img src={item.thumbnailUrl} alt={item.title} loading="lazy" className="aspect-video w-full rounded-lg bg-muted object-cover" />
                  <figcaption className="line-clamp-2 text-xs text-muted-foreground">{item.title}</figcaption>
                </figure>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
