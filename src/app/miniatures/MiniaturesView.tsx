"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, ImagePlus, Images, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { RunIndicator } from "@/components/agent-runs/RunIndicator";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

type VideoProject = {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  imageCount: number;
};

// Full class strings so Tailwind keeps them; picked per project from its id so
// a card keeps the same colour across reloads.
const TILE_GRADIENTS = [
  "from-violet-500 to-fuchsia-600",
  "from-sky-500 to-indigo-600",
  "from-emerald-500 to-teal-700",
  "from-amber-400 to-orange-600",
  "from-rose-500 to-pink-700",
  "from-cyan-400 to-blue-700",
];

function gradientFor(id: string): string {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return TILE_GRADIENTS[hash % TILE_GRADIENTS.length];
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

function ProjectTile({ id, children }: { id: string; children?: ReactNode }) {
  return (
    <div className={`relative flex aspect-video items-center justify-center overflow-hidden bg-linear-to-br ${gradientFor(id)}`}>
      <div className="absolute -top-1/2 -left-1/4 size-[120%] rounded-full bg-white/20 blur-3xl" />
      <div className="relative flex size-20 items-center justify-center rounded-2xl bg-white/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.5),inset_0_-6px_12px_rgba(0,0,0,0.2),0_14px_28px_-8px_rgba(0,0,0,0.5)] ring-1 ring-white/25 transition-transform duration-300 group-hover/card:-translate-y-1 group-hover/card:-rotate-3">
        <ImagePlus aria-hidden className="absolute size-10 translate-x-0.5 translate-y-1 text-black/35" strokeWidth={2.25} />
        <ImagePlus aria-hidden className="relative size-10 text-white drop-shadow-[0_1px_0_rgba(255,255,255,0.6)]" strokeWidth={2.25} />
      </div>
      {children}
    </div>
  );
}

type FormState = { mode: "create" } | { mode: "edit"; project: VideoProject };

function ProjectFormDialog({
  state,
  onClose,
  onSubmit,
}: {
  state: FormState | null;
  onClose: () => void;
  onSubmit: (values: { name: string; description: string }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!state) return;
    setName(state.mode === "edit" ? state.project.name : "");
    setDescription(state.mode === "edit" ? state.project.description : "");
  }, [state]);

  const isEdit = state?.mode === "edit";

  return (
    <Dialog open={state !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!name.trim() || submitting) return;
            setSubmitting(true);
            try {
              await onSubmit({ name: name.trim(), description: description.trim() });
            } finally {
              setSubmitting(false);
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>{isEdit ? "Modifier le projet" : "Nouvelle miniature"}</DialogTitle>
            <DialogDescription>
              {isEdit
                ? "Titre et description de la vidéo."
                : "Donne un titre à ta vidéo : tu arriveras ensuite sur le canvas pour créer les miniatures et leurs variantes."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="project-name">Titre</Label>
            <Input
              id="project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="OpenClaw est mort ! Comment configurer son équipe AI avec Grok Bot"
              autoFocus
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="project-description">Description</Label>
            <Textarea
              id="project-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Le sujet de la vidéo, l'angle, le public visé…"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" disabled={!name.trim() || submitting}>
              {submitting ? "Enregistrement…" : isEdit ? "Enregistrer" : "Créer et ouvrir"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function MiniaturesView() {
  const router = useRouter();
  const [projects, setProjects] = useState<VideoProject[] | null>(null);
  const [form, setForm] = useState<FormState | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/miniatures");
      setProjects((await res.json()) as VideoProject[]);
    } catch {
      setProjects([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const submitForm = async ({ name, description }: { name: string; description: string }) => {
    if (form?.mode === "edit") {
      await fetch(`/api/projects?id=${encodeURIComponent(form.project.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description }),
      });
      setForm(null);
      load();
      return;
    }
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description }),
    });
    if (!res.ok) return;
    const project = (await res.json()) as { id: string };
    setForm(null);
    router.push(`/m/${project.id}`);
  };

  const remove = async (project: VideoProject) => {
    if (!confirm(`Supprimer « ${project.name} » et son canvas ?`)) return;
    await fetch(`/api/projects?id=${encodeURIComponent(project.id)}`, { method: "DELETE" });
    load();
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <header className="mb-8 flex items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-medium">Mes miniatures</h1>
          <p className="text-sm text-muted-foreground">Un projet par vidéo, avec son workflow et toutes ses variantes.</p>
        </div>
        <Button onClick={() => setForm({ mode: "create" })}>
          <Plus />
          Nouvelle miniature
        </Button>
      </header>

      {projects === null && (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-72 rounded-xl" />
          ))}
        </div>
      )}

      {projects?.length === 0 && (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ImagePlus />
            </EmptyMedia>
            <EmptyTitle>Aucun projet pour l&apos;instant</EmptyTitle>
            <EmptyDescription>
              Crée un projet par vidéo : l&apos;agent cherche des références, propose des axes et génère les variantes à
              tester.
            </EmptyDescription>
          </EmptyHeader>
          <Button onClick={() => setForm({ mode: "create" })}>
            <Plus />
            Nouvelle miniature
          </Button>
        </Empty>
      )}

      {projects && projects.length > 0 && (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <Card
              key={project.id}
              role="link"
              tabIndex={0}
              onClick={() => router.push(`/m/${project.id}`)}
              onKeyDown={(e) => { if (e.key === "Enter") router.push(`/m/${project.id}`); }}
              className="cursor-pointer gap-0 pt-0 transition-colors hover:border-ring focus-visible:border-ring focus-visible:outline-none"
            >
              <ProjectTile id={project.id}>
                <RunIndicator projectId={project.id} className="absolute top-3 right-3 size-3" />
              </ProjectTile>
              <CardHeader className="pt-4">
                <CardTitle className="line-clamp-1">{project.name}</CardTitle>
                <CardDescription className="line-clamp-2 min-h-10">
                  {project.description || "Pas de description."}
                </CardDescription>
                <CardAction>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Actions pour ${project.name}`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreHorizontal />
                        </Button>
                      }
                    />
                    <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenuGroup>
                        <DropdownMenuItem onClick={() => setForm({ mode: "edit", project })}>
                          <Pencil />
                          Modifier
                        </DropdownMenuItem>
                        <DropdownMenuItem variant="destructive" onClick={() => remove(project)}>
                          <Trash2 />
                          Supprimer
                        </DropdownMenuItem>
                      </DropdownMenuGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </CardAction>
              </CardHeader>
              <CardFooter className="mt-4 justify-between gap-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <CalendarDays className="size-3.5" />
                  {formatDate(project.createdAt)}
                </span>
                <span className="flex items-center gap-1.5">
                  <Images className="size-3.5" />
                  {project.imageCount} {project.imageCount > 1 ? "miniatures" : "miniature"}
                </span>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      <ProjectFormDialog state={form} onClose={() => setForm(null)} onSubmit={submitForm} />
    </div>
  );
}
