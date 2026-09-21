"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Clapperboard, FolderOpen, LayoutGrid, List, MoreHorizontal, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { cn } from "cn";
import { emptyStudioDraft } from "@/lib/studio/page-template";
import {
  ETIQUETTES,
  isEtiquette,
  UNTITLED_STUDIO_VIDEO,
  type Etiquette,
  type StudioDraft,
  type TitleVariant,
} from "@/lib/studio/types";
import { isStudioDraftVisible } from "@/lib/studio/visibility";
import { useChatStore } from "@/store/chat-store";
import { useStudioCreateStore } from "@/store/studio-create-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import ConfirmDialog from "@/components/settings/ConfirmDialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";

type BoardVideo = {
  videoId: string;
  title: string;
  summary: string;
  etiquette: Etiquette | null;
  youtubeUrl: string | null;
  updatedAt?: string;
  draft?: StudioDraft;
};

type FormState = { mode: "edit"; video: BoardVideo };

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function formatDate(iso: string | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

function VideoFormDialog({
  state,
  onClose,
  onSubmit,
}: {
  state: FormState | null;
  onClose: () => void;
  onSubmit: (values: { title: string; description: string }) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!state) return;
    setTitle(state.video.title);
    setDescription(state.video.summary);
  }, [state]);

  return (
    <Dialog open={state !== null} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!title.trim() || submitting) return;
            setSubmitting(true);
            try {
              await onSubmit({ title: title.trim(), description: description.trim() });
            } finally {
              setSubmitting(false);
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>Modifier la vidéo</DialogTitle>
            <DialogDescription>
              Titre et notes de la fiche — distincts de la description YouTube.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="studio-video-title">Titre</Label>
            <Input
              id="studio-video-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="OpenClaw est mort ! Comment configurer son équipe AI avec Grok Bot"
              autoFocus
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="studio-video-description">Description</Label>
            <Textarea
              id="studio-video-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Le sujet de la vidéo, l'angle, le public visé…"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" disabled={!title.trim() || submitting}>
              {submitting ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function stopCardEvent(event: { stopPropagation: () => void }) {
  event.stopPropagation();
}

function VideoActionsMenu({
  video,
  onOpen,
  onEdit,
  onDelete,
}: {
  video: BoardVideo;
  onOpen: (videoId: string) => void;
  onEdit: (video: BoardVideo) => void;
  onDelete: (video: BoardVideo) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Actions pour ${video.title}`}
            onPointerDown={stopCardEvent}
            onClick={stopCardEvent}
          >
            <MoreHorizontal />
          </Button>
        }
      />
      <DropdownMenuContent align="end" onPointerDown={stopCardEvent} onClick={stopCardEvent}>
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => onOpen(video.videoId)}>
            <FolderOpen />
            Ouvrir
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onEdit(video)}>
            <Pencil />
            Modifier
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onClick={() => onDelete(video)}
          >
            <Trash2 />
            Supprimer
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function asVariant(raw: unknown): TitleVariant {
  if (!raw || typeof raw !== "object") return { title: "", thumbText: "", visualConcept: "" };
  const row = raw as Partial<TitleVariant>;
  return {
    title: typeof row.title === "string" ? row.title : "",
    thumbText: typeof row.thumbText === "string" ? row.thumbText : "",
    visualConcept: typeof row.visualConcept === "string" ? row.visualConcept : "",
  };
}

function asDraft(raw: unknown): StudioDraft {
  const empty = emptyStudioDraft();
  if (!raw || typeof raw !== "object") return empty;
  const draft = raw as Partial<StudioDraft>;
  const variants = Array.isArray(draft.titleVariants) ? draft.titleVariants : [];
  return {
    script: typeof draft.script === "string" ? draft.script : empty.script,
    description: typeof draft.description === "string" ? draft.description : empty.description,
    titleVariants: [asVariant(variants[0]), asVariant(variants[1]), asVariant(variants[2])],
  };
}

function asBoardVideos(body: unknown): BoardVideo[] {
  if (!Array.isArray(body)) return [];
  return body.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const row = raw as Record<string, unknown>;
    if (typeof row.videoId !== "string" || typeof row.title !== "string") return [];
    return [
      {
        videoId: row.videoId,
        title: row.title,
        summary: typeof row.summary === "string" ? row.summary : "",
        etiquette: typeof row.etiquette === "string" && isEtiquette(row.etiquette) ? row.etiquette : null,
        youtubeUrl: typeof row.youtubeUrl === "string" ? row.youtubeUrl : null,
        updatedAt: typeof row.updatedAt === "string" ? row.updatedAt : undefined,
        draft: asDraft(row.draft),
      },
    ];
  });
}

function isBoardVideoVisible(video: BoardVideo): boolean {
  return isStudioDraftVisible({
    title: video.title,
    summary: video.summary,
    youtubeUrl: video.youtubeUrl,
    draft: video.draft ?? emptyStudioDraft(),
  });
}

export default function VideosBoard() {
  const router = useRouter();
  const [videos, setVideos] = useState<BoardVideo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);
  const [pendingDelete, setPendingDelete] = useState<BoardVideo | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [abandonBusy, setAbandonBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [view, setView] = useState<"kanban" | "liste">("kanban");
  const [importOpen, setImportOpen] = useState(false);
  const [csv, setCsv] = useState("");
  const [importing, setImporting] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const suppressCardClick = useRef(false);
  const abandonRequest = useStudioCreateStore((state) => state.abandonRequest);
  const activeConversationId = useChatStore((state) => state.activeConversationId);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/studio/videos", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setVideos(asBoardVideos(await res.json()));
      setError(null);
    } catch {
      setError("Chargement impossible — vérifie ta connexion et réessaie.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const dropCreate = useCallback(async (videoId: string, remove: boolean) => {
    if (remove) {
      await fetch(`/api/studio/videos/${encodeURIComponent(videoId)}`, { method: "DELETE" });
    }
    useStudioCreateStore.getState().clearAbandon();
    router.replace("/videos");
    await load();
  }, [load, router]);

  useEffect(() => {
    if (!abandonRequest || videos === null) return;
    const row = videos.find((item) => item.videoId === abandonRequest);
    const visible = row ? isBoardVideoVisible(row) : false;
    if (visible) {
      void dropCreate(abandonRequest, false);
      return;
    }
    if (!activeConversationId) {
      void dropCreate(abandonRequest, true);
    }
  }, [abandonRequest, activeConversationId, dropCreate, videos]);

  const openVideo = (videoId: string) => {
    router.push(`/videos/${videoId}`);
  };

  const submitForm = async ({ title, description }: { title: string; description: string }) => {
    if (creating || !form) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch(`/api/studio/videos/${encodeURIComponent(form.video.videoId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description }),
      });
      if (!res.ok) {
        setError("Impossible d'enregistrer la vidéo.");
        return;
      }
      setForm(null);
      await load();
    } catch {
      setError("Impossible d'enregistrer la vidéo.");
    } finally {
      setCreating(false);
    }
  };

  const startCreate = async () => {
    if (creating) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/studio/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: UNTITLED_STUDIO_VIDEO, etiquette: "Propositions" }),
      });
      if (!res.ok) {
        setError("Impossible de créer la vidéo.");
        return;
      }
      const body = (await res.json()) as { videoId?: string };
      if (!body.videoId) {
        setError("Impossible de créer la vidéo.");
        return;
      }
      router.replace(`/videos?create=${encodeURIComponent(body.videoId)}`);
    } catch {
      setError("Impossible de créer la vidéo.");
    } finally {
      setCreating(false);
    }
  };

  const removeVideo = async () => {
    if (!pendingDelete || deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/studio/videos/${encodeURIComponent(pendingDelete.videoId)}`, { method: "DELETE" });
      if (!res.ok) {
        setDeleteError("La suppression a échoué. Réessaie.");
        toast({ title: "Impossible de supprimer la vidéo" });
        return;
      }
      setPendingDelete(null);
      await load();
    } catch {
      setDeleteError("La suppression a échoué. Réessaie.");
      toast({ title: "Impossible de supprimer la vidéo" });
    } finally {
      setDeleting(false);
    }
  };

  const moveVideo = async (videoId: string, etiquette: Etiquette) => {
    setVideos((previous) =>
      previous?.map((video) => (video.videoId === videoId ? { ...video, etiquette } : video)) ?? null,
    );
    try {
      const res = await fetch(`/api/studio/videos/${encodeURIComponent(videoId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ etiquette }),
      });
      if (!res.ok) void load();
    } catch {
      void load();
    }
  };

  const importCsv = async () => {
    if (!csv.trim() || importing) return;
    setImporting(true);
    setError(null);
    try {
      const res = await fetch("/api/studio/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv }),
      });
      if (!res.ok) {
        setError("L'import a échoué. Vérifie le CSV et réessaie.");
        return;
      }
      setImportOpen(false);
      setCsv("");
      await load();
    } catch {
      setError("L'import a échoué. Vérifie le CSV et réessaie.");
    } finally {
      setImporting(false);
    }
  };

  const visibleVideos = videos?.filter(isBoardVideoVisible) ?? [];
  const empty = videos !== null && visibleVideos.length === 0;
  const abandoningVideo = videos?.find((video) => video.videoId === abandonRequest);
  const abandonNeedsConfirm = Boolean(
    abandonRequest &&
      activeConversationId &&
      videos !== null &&
      (!abandoningVideo || !isBoardVideoVisible(abandoningVideo)),
  );
  const reduceMotion = prefersReducedMotion();

  return (
    <div className="w-full px-6 py-8">
      <div className="mx-auto w-full max-w-6xl">
        <header className="mb-8 flex items-end justify-between gap-4">
          <div>
            <h1 className="font-heading text-2xl font-medium">Vidéos</h1>
            <p className="text-sm text-muted-foreground">Scripts, titres et pipeline — le studio d&apos;écriture.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-border p-0.5">
              <Button
                type="button"
                variant={view === "kanban" ? "secondary" : "ghost"}
                size="sm"
                aria-pressed={view === "kanban"}
                onClick={() => setView("kanban")}
              >
                <LayoutGrid />
                Kanban
              </Button>
              <Button
                type="button"
                variant={view === "liste" ? "secondary" : "ghost"}
                size="sm"
                aria-pressed={view === "liste"}
                onClick={() => setView("liste")}
              >
                <List />
                Liste
              </Button>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="ghost" size="icon" aria-label="Autres actions">
                    <MoreHorizontal />
                  </Button>
                }
              />
              <DropdownMenuContent align="end">
                <DropdownMenuGroup>
                  <DropdownMenuItem onClick={() => setImportOpen(true)}>
                    <Upload />
                    Importer un export
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button type="button" onClick={() => void startCreate()} disabled={creating}>
              <Plus />
              Nouvelle vidéo
            </Button>
          </div>
        </header>

        {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
        {videos === null && !error && <p className="mb-4 text-sm text-muted-foreground">Chargement…</p>}

        {empty && (
          <Empty className="border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Clapperboard />
              </EmptyMedia>
              <EmptyTitle>Aucune vidéo pour l&apos;instant</EmptyTitle>
              <EmptyDescription>
                ThumbGen est ton studio d&apos;écriture. Crée une fiche, ou importe un export une fois.
              </EmptyDescription>
            </EmptyHeader>
            <Button type="button" onClick={() => void startCreate()} disabled={creating}>
              <Plus />
              Nouvelle vidéo
            </Button>
          </Empty>
        )}

        {view === "liste" && visibleVideos.length > 0 && (
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Titre</th>
                  <th className="px-3 py-2 font-medium">Étiquette</th>
                  <th className="px-3 py-2 font-medium">URL</th>
                  <th className="px-3 py-2 font-medium">Mis à jour</th>
                  <th className="px-3 py-2 font-medium"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {visibleVideos.map((video) => (
                  <tr
                    key={video.videoId}
                    role="link"
                    tabIndex={0}
                    className="cursor-pointer border-t hover:bg-muted/40"
                    onClick={() => openVideo(video.videoId)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openVideo(video.videoId);
                      }
                    }}
                  >
                    <td className="px-3 py-2 font-medium">
                      <p>{video.title}</p>
                      {video.summary && <p className="line-clamp-2 text-xs font-normal text-muted-foreground">{video.summary}</p>}
                    </td>
                    <td className="px-3 py-2">{video.etiquette ?? "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{video.youtubeUrl ?? "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{formatDate(video.updatedAt)}</td>
                    <td className="px-3 py-2 text-right" onClick={stopCardEvent} onKeyDown={stopCardEvent}>
                      <VideoActionsMenu
                        video={video}
                        onOpen={openVideo}
                        onEdit={(next) => setForm({ mode: "edit", video: next })}
                        onDelete={(next) => {
                          setDeleteError(null);
                          setPendingDelete(next);
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {view === "kanban" && visibleVideos.length > 0 && (
          <div className="flex min-h-112 gap-3 overflow-x-auto pb-2">
            {ETIQUETTES.map((column) => (
              <section
                key={column}
                className="flex min-w-56 flex-1 flex-col gap-2 rounded-xl bg-muted/40 p-2"
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const videoId = event.dataTransfer.getData("text/plain");
                  setDraggingId(null);
                  if (videoId) void moveVideo(videoId, column);
                }}
              >
                <h2 className="px-1 py-1 text-sm font-medium">{column}</h2>
                {visibleVideos
                  .filter((video) => (video.etiquette ?? "Propositions") === column)
                  .map((video) => (
                    <div
                      key={video.videoId}
                      role="link"
                      tabIndex={0}
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.setData("text/plain", video.videoId);
                        event.dataTransfer.effectAllowed = "move";
                        setDraggingId(video.videoId);
                      }}
                      onDragEnd={() => {
                        setDraggingId(null);
                        suppressCardClick.current = true;
                        window.setTimeout(() => {
                          suppressCardClick.current = false;
                        }, 0);
                      }}
                      onClick={() => {
                        if (suppressCardClick.current) return;
                        openVideo(video.videoId);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          if (!suppressCardClick.current) openVideo(video.videoId);
                        }
                      }}
                      className={cn(
                        "relative w-full cursor-pointer rounded-xl border bg-card p-3 text-left shadow-sm hover:border-ring focus-visible:border-ring focus-visible:outline-none",
                        !reduceMotion && "transition-transform",
                        draggingId === video.videoId && !reduceMotion && "scale-[1.02] opacity-80",
                      )}
                    >
                      <div className="absolute top-1.5 right-1.5" onClick={stopCardEvent} onKeyDown={stopCardEvent}>
                        <VideoActionsMenu
                          video={video}
                          onOpen={openVideo}
                          onEdit={(next) => setForm({ mode: "edit", video: next })}
                          onDelete={(next) => {
                            setDeleteError(null);
                            setPendingDelete(next);
                          }}
                        />
                      </div>
                      <p className="line-clamp-2 pr-8 font-medium">{video.title}</p>
                      {video.summary && (
                        <p className="mt-1 line-clamp-2 pr-8 text-xs text-muted-foreground">{video.summary}</p>
                      )}
                      {video.youtubeUrl && (
                        <Badge variant="secondary" className="mt-2">
                          URL
                        </Badge>
                      )}
                    </div>
                  ))}
              </section>
            ))}
          </div>
        )}
      </div>

      <VideoFormDialog state={form} onClose={() => setForm(null)} onSubmit={submitForm} />
      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) {
            setPendingDelete(null);
            setDeleteError(null);
          }
        }}
        title="Supprimer cette vidéo ?"
        description={
          pendingDelete
            ? `« ${pendingDelete.title} » et son brouillon seront supprimés. Le chat de cette fiche part avec.`
            : ""
        }
        confirmLabel="Supprimer"
        busy={deleting}
        onConfirm={() => void removeVideo()}
        error={deleteError}
      />
      <ConfirmDialog
        open={abandonNeedsConfirm}
        onOpenChange={(open) => {
          if (!open && !abandonBusy) useStudioCreateStore.getState().clearAbandon();
        }}
        title="Abandonner ce brouillon ?"
        description="La conversation sera perdue. La fiche vide sera supprimée."
        confirmLabel="Abandonner"
        busy={abandonBusy}
        onConfirm={() => {
          if (!abandonRequest || abandonBusy) return;
          setAbandonBusy(true);
          void dropCreate(abandonRequest, true).finally(() => setAbandonBusy(false));
        }}
      />

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent>
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void importCsv();
            }}
          >
            <DialogHeader>
              <DialogTitle>Importer un export</DialogTitle>
              <DialogDescription>
                Colle un export CSV (Nom, URL, Étiquettes) pour créer les fiches une fois.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <Label htmlFor="studio-export-csv">Export CSV</Label>
              <Textarea
                id="studio-export-csv"
                value={csv}
                onChange={(event) => setCsv(event.target.value)}
                rows={8}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setImportOpen(false)}>
                Annuler
              </Button>
              <Button type="submit" disabled={!csv.trim() || importing}>
                {importing ? "Import…" : "Importer"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
