"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2 } from "lucide-react";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { referenceLinkFor } from "@/lib/canvas/pending-reference";
import type { UseVideoResponse, VideoListItem } from "@/lib/youtube/types";
import { ApiError, channelsApi } from "./api";

type CopyState = { status: "copying" } | { status: "copied"; copy: UseVideoResponse } | { status: "error"; message: string };
type ProjectOption = { id: string; name: string };

type Props = { video: VideoListItem; onClose: () => void };

/** Copies the thumbnail into the library, then offers to open a miniature with it as a reference. */
export default function UseAsReferenceDialog({ video, onClose }: Props) {
  const router = useRouter();
  const [state, setState] = useState<CopyState>({ status: "copying" });
  const [projects, setProjects] = useState<ProjectOption[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    channelsApi
      .use(video.videoId)
      .then((copy) => {
        if (!cancelled) setState({ status: "copied", copy });
      })
      .catch((err: unknown) => {
        if (!cancelled) setState({ status: "error", message: err instanceof ApiError ? err.message : "Copie impossible" });
      });
    fetch("/api/miniatures", { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<ProjectOption[]>) : []))
      .then((list) => {
        if (!cancelled) setProjects(list);
      })
      .catch(() => {
        if (!cancelled) setProjects([]);
      });
    return () => {
      cancelled = true;
    };
  }, [video.videoId]);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Utiliser comme référence</DialogTitle>
          <DialogDescription className="line-clamp-2">{video.title}</DialogDescription>
        </DialogHeader>

        {state.status === "copying" && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Copie dans ta bibliothèque…
          </p>
        )}

        {state.status === "error" && (
          <Alert variant="destructive">
            <AlertTitle>{state.message}</AlertTitle>
          </Alert>
        )}

        {state.status === "copied" && (
          <div className="grid gap-4">
            <div className="flex items-center gap-3">
              <img src={state.copy.imageUrl} alt="" className="aspect-video w-32 shrink-0 rounded-md object-cover" />
              <p className="text-sm">Ajoutée à ta bibliothèque (Inspirations → Mes images).</p>
            </div>
            <div className="grid gap-2">
              <p className="text-sm font-medium">Ouvrir dans une miniature…</p>
              {projects === null ? (
                <Skeleton className="h-9 w-full" />
              ) : projects.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucune miniature pour l&apos;instant : crée-en une dans « Mes miniatures ».</p>
              ) : (
                <div className="grid max-h-64 gap-1 overflow-y-auto">
                  {projects.map((project) => (
                    <Button
                      key={project.id}
                      variant="ghost"
                      className="justify-start"
                      onClick={() => router.push(referenceLinkFor(project.id, state.copy.swipeFileId))}
                    >
                      <ImagePlus />
                      <span className="truncate">{project.name}</span>
                    </Button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Fermer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
