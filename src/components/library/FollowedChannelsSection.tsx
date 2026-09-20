"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { KeyRound, Tv } from "lucide-react";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import type { VideoListItem, WorkingSubjectHit } from "@/lib/youtube/types";
import ChannelBar from "./followed-channels/ChannelBar";
import FollowChannelDialog from "./followed-channels/FollowChannelDialog";
import TypesSummary from "./followed-channels/TypesSummary";
import UseAsReferenceDialog from "./followed-channels/UseAsReferenceDialog";
import VideoInfoDialog from "./followed-channels/VideoInfoDialog";
import { useFollowedChannels } from "./followed-channels/useFollowedChannels";
import { useWorkingPeriod } from "./followed-channels/useThemeDisplay";
import VideoGrid from "./followed-channels/VideoGrid";

const GOOGLE_KEY_HELP = "https://console.cloud.google.com/apis/credentials";

/** Inspirations → « Chaînes suivies » (chantier D). Default export without props: chantier C's contract. */
export default function FollowedChannelsSection() {
  const { data, error, reload, version } = useFollowedChannels();
  const { period, setPeriod } = useWorkingPeriod();
  const [followOpen, setFollowOpen] = useState(false);
  const [workingSubject, setWorkingSubject] = useState<WorkingSubjectHit | null>(null);
  const [infoVideo, setInfoVideo] = useState<VideoListItem | null>(null);
  const [referenceVideo, setReferenceVideo] = useState<VideoListItem | null>(null);
  const onSubject = useCallback((subject: WorkingSubjectHit | null) => setWorkingSubject(subject), []);

  return (
    <section aria-labelledby="followed-channels-title" className="grid gap-4">
      <div className="grid gap-1">
        <h2 id="followed-channels-title" className="text-lg font-semibold">
          Chaînes suivies
        </h2>
        <p className="text-sm text-muted-foreground">
          Les 4 vidéos qui performent le plus sur tes chaînes suivies (7 jours), puis le swipe. Le type de vidéo se
          filtre à part.
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>{error}</AlertTitle>
        </Alert>
      )}

      {data === null ? (
        <Skeleton className="h-24 w-full" />
      ) : !data.youtubeConfigured ? (
        <YouTubeKeyCard />
      ) : (
        <>
          <ChannelBar channels={data.channels} onFollow={() => setFollowOpen(true)} onChanged={() => void reload()} />
          {data.channels.length === 0 ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Tv />
                </EmptyMedia>
                <EmptyTitle>Aucune chaîne suivie</EmptyTitle>
                <EmptyDescription>
                  Suis une chaîne pour importer ses vidéos longues, leurs vues et leurs miniatures. Renseigne aussi « Ma
                  chaîne » dans Réglages pour l&apos;ajouter automatiquement.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <>
              <TypesSummary version={version} onOpen={setInfoVideo} onSubject={onSubject} />
              <VideoGrid
                channels={data.channels}
                version={version}
                period={period}
                onPeriod={setPeriod}
                onOpen={setInfoVideo}
                onUse={setReferenceVideo}
              />
            </>
          )}
        </>
      )}

      <FollowChannelDialog open={followOpen} onOpenChange={setFollowOpen} onFollowed={() => void reload()} />
      {infoVideo && (
        <VideoInfoDialog
          key={infoVideo.videoId}
          video={infoVideo}
          period={period}
          subjectLabel={workingSubject?.label ?? null}
          onClose={() => setInfoVideo(null)}
          onUse={setReferenceVideo}
        />
      )}
      {referenceVideo && (
        <UseAsReferenceDialog key={referenceVideo.videoId} video={referenceVideo} onClose={() => setReferenceVideo(null)} />
      )}
    </section>
  );
}

function YouTubeKeyCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="size-4" />
          Ajoute ta clé YouTube (gratuite)
        </CardTitle>
        <CardDescription>
          Elle sert à importer les vidéos des chaînes suivies avec leurs vues. Sans clé, ThumbGen n&apos;envoie aucune
          requête à YouTube.
        </CardDescription>
      </CardHeader>
      <CardFooter className="flex flex-wrap gap-2">
        <Link href="/reglages/connexions" className={buttonVariants()}>
          Ajouter ma clé
        </Link>
        <a href={GOOGLE_KEY_HELP} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline" })}>
          Créer une clé dans Google Cloud
        </a>
      </CardFooter>
    </Card>
  );
}
