"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Trash2 } from "lucide-react";
import LinkedThumbs from "@/components/studio/LinkedThumbs";
import StudioEditorChrome from "@/components/studio/StudioEditorChrome";
import TitleVariantsTable from "@/components/studio/TitleVariantsTable";
import ConfirmDialog from "@/components/settings/ConfirmDialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { STUDIO_PHASE_COPY } from "@/lib/studio/agent-phase";
import type { LinkedStudioProject } from "@/lib/studio/link-project";
import { emptyStudioDraft } from "@/lib/studio/page-template";
import {
  ETIQUETTES,
  isEtiquette,
  type Etiquette,
  type StudioDraft,
  type TitleVariant,
} from "@/lib/studio/types";
import { useStudioLiveStore } from "@/store/studio-live-store";

type MiniatureProject = {
  id: string;
  name: string;
  coverImageUrl?: string | null;
};

function linkedProjectsFrom(raw: unknown): LinkedStudioProject[] {
  if (!raw || typeof raw !== "object" || !Array.isArray((raw as { projects?: unknown }).projects)) return [];
  return (raw as { projects: unknown[] }).projects.filter(
    (project): project is LinkedStudioProject =>
      Boolean(
        project &&
          typeof project === "object" &&
          typeof (project as LinkedStudioProject).id === "string" &&
          typeof (project as LinkedStudioProject).name === "string" &&
          ["A", "B", "C"].includes((project as LinkedStudioProject).slot),
      ),
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

export default function VideoEditor({ videoId }: { videoId: string }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [etiquette, setEtiquette] = useState<Etiquette | null>(null);
  const [script, setScript] = useState("");
  const [description, setDescription] = useState("");
  const [titleVariants, setTitleVariants] = useState<StudioDraft["titleVariants"]>(emptyStudioDraft().titleVariants);
  const [loaded, setLoaded] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [pendingDelete, setPendingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [linkedProjects, setLinkedProjects] = useState<LinkedStudioProject[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerProjects, setPickerProjects] = useState<MiniatureProject[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [linkingProjectId, setLinkingProjectId] = useState<string | null>(null);
  const [creatingMiniature, setCreatingMiniature] = useState(false);
  const phase = useStudioLiveStore((state) => state.phase);
  const lastPatch = useStudioLiveStore((state) => state.lastPatch);
  const skipSave = useRef(true);
  const allowUnloadSave = useRef(false);
  const saveGeneration = useRef(0);
  const latestDraft = useRef({
    title: "",
    summary: "",
    etiquette: null as Etiquette | null,
    script: "",
    description: "",
    titleVariants: emptyStudioDraft().titleVariants,
  });
  latestDraft.current = { title, summary, etiquette, script, description, titleVariants };

  useEffect(() => {
    let cancelled = false;
    skipSave.current = true;
    setLoaded(false);
    setNotFound(false);
    setError(null);
    setSaveState("idle");
    setLinkedProjects([]);
    void (async () => {
      try {
        const videoRequest = fetch(`/api/studio/videos/${encodeURIComponent(videoId)}`, { cache: "no-store" });
        const miniatureRequest = fetch(`/api/studio/videos/${encodeURIComponent(videoId)}/miniature`, {
          cache: "no-store",
        }).catch(() => null);
        const res = await videoRequest;
        if (cancelled) return;
        if (res.status === 404) {
          setNotFound(true);
          return;
        }
        if (!res.ok) {
          setError("Chargement impossible — vérifie ta connexion et réessaie.");
          return;
        }
        const body = (await res.clone().json()) as {
          updatedAt?: string;
          title?: string;
          summary?: string;
          etiquette?: string | null;
          draft?: unknown;
        };
        const draft = asDraft(body.draft);
        setTitle(typeof body.title === "string" ? body.title : "");
        setSummary(typeof body.summary === "string" ? body.summary : "");
        setEtiquette(typeof body.etiquette === "string" && isEtiquette(body.etiquette) ? body.etiquette : null);
        setScript(draft.script);
        setDescription(draft.description);
        setTitleVariants(draft.titleVariants);
        if (typeof body.updatedAt === "string") {
          useStudioLiveStore.setState({ knownUpdatedAt: body.updatedAt });
        }
        const miniatureRes = await miniatureRequest;
        if (miniatureRes?.ok) {
          const miniatureBody = (await miniatureRes.clone().json().catch(() => null)) as unknown;
          if (!cancelled) setLinkedProjects(linkedProjectsFrom(miniatureBody));
        }
        setLoaded(true);
      } catch {
        if (!cancelled) setError("Chargement impossible — vérifie ta connexion et réessaie.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [videoId]);

  const removeVideo = async () => {
    if (deleting) return;
    setDeleting(true);
    setDeleteError(null);
    skipSave.current = true;
    try {
      const res = await fetch(`/api/studio/videos/${encodeURIComponent(videoId)}`, { method: "DELETE" });
      if (!res.ok) {
        skipSave.current = false;
        setDeleteError("La suppression a échoué. Réessaie.");
        toast({ title: "Impossible de supprimer la vidéo" });
        return;
      }
      router.push("/videos");
    } catch {
      skipSave.current = false;
      setDeleteError("La suppression a échoué. Réessaie.");
      toast({ title: "Impossible de supprimer la vidéo" });
    } finally {
      setDeleting(false);
    }
  };

  useEffect(() => {
    if (!loaded || notFound) return;
    if (skipSave.current) {
      skipSave.current = false;
      return;
    }
    setSaveState("saving");
    const generation = ++saveGeneration.current;
    const timer = window.setTimeout(() => {
      void (async () => {
        const draft = latestDraft.current;
        if (!draft.title.trim()) return;
        try {
          const res = await fetch(`/api/studio/videos/${encodeURIComponent(videoId)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(draft),
          });
          if (generation !== saveGeneration.current) return;
          if (!res.ok) throw new Error("save");
          setSaveState("saved");
        } catch {
          if (generation !== saveGeneration.current) return;
          setSaveState("error");
        }
      })();
    }, 800);
    return () => window.clearTimeout(timer);
  }, [loaded, notFound, title, summary, etiquette, script, description, titleVariants, videoId]);

  useEffect(() => {
    if (!loaded || lastPatch?.videoId !== videoId) return;
    skipSave.current = true;
    allowUnloadSave.current = false;
    setTitle(lastPatch.title);
    setSummary(lastPatch.summary);
    setScript(lastPatch.script);
    setDescription(lastPatch.description);
    setTitleVariants(lastPatch.titleVariants);
  }, [lastPatch, loaded, videoId]);

  useEffect(() => {
    return () => {
      if (skipSave.current || !allowUnloadSave.current) return;
      const draft = latestDraft.current;
      if (!draft.title.trim()) return;
      void fetch(`/api/studio/videos/${encodeURIComponent(videoId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
        keepalive: true,
      });
    };
  }, [videoId]);

  const noteUserEdit = () => {
    allowUnloadSave.current = true;
  };

  const loadPickerProjects = async () => {
    setPickerLoading(true);
    setPickerError(null);
    try {
      const res = await fetch("/api/miniatures", { cache: "no-store" });
      if (!res.ok) throw new Error("load");
      const body = (await res.json()) as unknown;
      setPickerProjects(
        Array.isArray(body)
          ? body.filter(
              (project): project is MiniatureProject =>
                Boolean(
                  project &&
                    typeof project === "object" &&
                    typeof (project as MiniatureProject).id === "string" &&
                    typeof (project as MiniatureProject).name === "string",
                ),
            )
          : [],
      );
    } catch {
      setPickerError("Chargement des miniatures impossible. Réessaie.");
    } finally {
      setPickerLoading(false);
    }
  };

  const linkMiniature = async (projectId: string) => {
    if (linkingProjectId) return;
    setLinkingProjectId(projectId);
    setPickerError(null);
    try {
      const res = await fetch(`/api/studio/videos/${encodeURIComponent(videoId)}/miniature`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      const body = (await res.json().catch(() => null)) as unknown;
      if (!res.ok) throw new Error("link");
      setLinkedProjects(linkedProjectsFrom(body));
      setPickerOpen(false);
    } catch {
      setPickerError("Impossible de lier cette miniature. Réessaie.");
    } finally {
      setLinkingProjectId(null);
    }
  };

  const unlinkMiniature = async (projectId: string) => {
    try {
      const res = await fetch(`/api/studio/videos/${encodeURIComponent(videoId)}/miniature`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      const body = (await res.json().catch(() => null)) as unknown;
      if (!res.ok) throw new Error("unlink");
      setLinkedProjects(linkedProjectsFrom(body));
    } catch {
      toast({ title: "Impossible de délier la miniature" });
    }
  };

  const createMiniature = async () => {
    if (creatingMiniature) return;
    setCreatingMiniature(true);
    try {
      const res = await fetch(`/api/studio/videos/${encodeURIComponent(videoId)}/miniature`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = (await res.json().catch(() => null)) as { project?: { id?: unknown } } | null;
      if (!res.ok || typeof body?.project?.id !== "string") throw new Error("create");
      router.push(`/m/${body.project.id}`);
    } catch {
      toast({ title: "Impossible de créer la miniature" });
      setCreatingMiniature(false);
    }
  };

  if (notFound) {
    return (
      <div className="flex h-svh flex-col items-center justify-center gap-3 px-6">
        <p className="font-heading text-2xl font-medium">Vidéo introuvable</p>
        <Link href="/videos" className="text-sm text-muted-foreground underline underline-offset-4">
          Retour aux vidéos
        </Link>
      </div>
    );
  }

  return (
    <div className="h-svh overflow-y-auto px-6 py-6 pb-24">
      <fieldset disabled={!loaded} className="contents">
        <header className="mb-6 flex flex-wrap items-end gap-3">
          <span className="sr-only">{title}</span>
          <Input
            value={title}
            disabled={!loaded}
            onChange={(event) => {
              noteUserEdit();
              setTitle(event.target.value);
            }}
            aria-label="Titre"
            className="font-heading max-w-xl text-2xl font-medium"
          />
          <Select
            items={ETIQUETTES.map((value) => ({ value, label: value }))}
            value={etiquette ?? "Propositions"}
            onValueChange={(next) => {
              if (next && isEtiquette(next)) {
                noteUserEdit();
                setEtiquette(next);
              }
            }}
          >
            <SelectTrigger aria-label="Étiquettes">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ETIQUETTES.map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {saveState === "saved" && <span className="text-sm text-muted-foreground">Enregistré</span>}
          {saveState === "error" && <span className="text-sm text-destructive">Enregistrement impossible</span>}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button type="button" variant="ghost" size="icon" aria-label="Actions de la vidéo">
                  <MoreHorizontal />
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => {
                    setDeleteError(null);
                    setPendingDelete(true);
                  }}
                >
                  <Trash2 />
                  Supprimer
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

        <div className="grid max-w-[72ch] gap-6">
          <div className="grid gap-2">
            <Label htmlFor="studio-project-summary">Notes</Label>
            <Textarea
              id="studio-project-summary"
              value={summary}
              disabled={!loaded}
              onChange={(event) => {
                noteUserEdit();
                setSummary(event.target.value);
              }}
              placeholder="Le sujet de la vidéo, l&apos;angle, le public visé…"
              rows={3}
            />
          </div>
          {phase === "writing" && lastPatch?.videoId !== videoId && (
            <p aria-live="polite" className="text-sm text-muted-foreground">
              {STUDIO_PHASE_COPY.writing}
            </p>
          )}
          <StudioEditorChrome
            filling={phase === "filling"}
            scriptEmpty={!script.trim()}
            descriptionEmpty={!description.trim()}
            titlesEmpty={titleVariants.every(
              (variant) => !variant.title.trim() && !variant.thumbText.trim() && !variant.visualConcept.trim(),
            )}
            script={
              <Textarea
                id="studio-script"
                value={script}
                disabled={!loaded}
                onChange={(event) => {
                  noteUserEdit();
                  setScript(event.target.value);
                }}
                className="min-h-64 font-mono text-sm"
                rows={16}
              />
            }
            description={
              <Textarea
                id="studio-description"
                value={description}
                disabled={!loaded}
                onChange={(event) => {
                  noteUserEdit();
                  setDescription(event.target.value);
                }}
                className="min-h-40"
                rows={8}
              />
            }
            titles={
              <TitleVariantsTable
                videoId={videoId}
                variants={titleVariants}
                onChange={(next) => {
                  noteUserEdit();
                  setTitleVariants(next);
                }}
              />
            }
          />
        </div>

        <LinkedThumbs
          projects={linkedProjects}
          onLinkClick={() => {
            setPickerOpen(true);
            void loadPickerProjects();
          }}
          onCreateClick={() => void createMiniature()}
          onUnlinkClick={(projectId) => void unlinkMiniature(projectId)}
        />
      </fieldset>
      <ConfirmDialog
        open={pendingDelete}
        onOpenChange={(open) => {
          if (!open && !deleting) {
            setPendingDelete(false);
            setDeleteError(null);
          }
        }}
        title="Supprimer cette vidéo ?"
        description={`« ${title} » et son brouillon seront supprimés. Le chat de cette fiche part avec.`}
        confirmLabel="Supprimer"
        busy={deleting}
        onConfirm={() => void removeVideo()}
        error={deleteError}
      />
      <Dialog
        open={pickerOpen}
        onOpenChange={(open) => {
          setPickerOpen(open);
          if (!open) setPickerError(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Choisir une miniature</DialogTitle>
            <DialogDescription>Sélectionne un projet canvas à associer à cette fiche.</DialogDescription>
          </DialogHeader>
          {pickerLoading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Chargement…</p>
          ) : (
            <div className="grid max-h-[60vh] gap-2 overflow-y-auto">
              {pickerProjects
                .filter((project) => !linkedProjects.some((linked) => linked.id === project.id))
                .map((project) => (
                  <Button
                    key={project.id}
                    type="button"
                    variant="outline"
                    className="h-auto min-h-11 justify-start gap-3 p-2"
                    disabled={linkingProjectId !== null}
                    onClick={() => void linkMiniature(project.id)}
                  >
                    <span className="flex aspect-video h-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                      {project.coverImageUrl ? (
                        <img src={project.coverImageUrl} alt="" className="size-full object-cover" />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </span>
                    <span className="truncate">{project.name}</span>
                  </Button>
                ))}
              {pickerProjects.filter((project) => !linkedProjects.some((linked) => linked.id === project.id)).length ===
                0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Crée d&apos;abord une miniature dans Mes miniatures.
                </p>
              )}
            </div>
          )}
          {pickerError && (
            <p role="alert" className="text-sm text-destructive">
              {pickerError}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
