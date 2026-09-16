"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ImageIcon, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";

type MiniatureImage = { id: string; url: string; createdAt: string };
type VideoProject = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  imageCount: number;
  images: MiniatureImage[];
};

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

export default function MiniaturesView() {
  const router = useRouter();
  const [projects, setProjects] = useState<VideoProject[] | null>(null);
  const [unassigned, setUnassigned] = useState<MiniatureImage[]>([]);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/miniatures");
      const data = (await res.json()) as { projects: VideoProject[]; unassigned: MiniatureImage[] };
      setProjects(data.projects);
      setUnassigned(data.unassigned);
    } catch {
      setProjects([]);
      setUnassigned([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const createProject = async () => {
    setCreating(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Nouvelle miniature" }),
      });
      if (!res.ok) return;
      const project = (await res.json()) as { id: string };
      router.push(`/m/${project.id}`);
    } finally {
      setCreating(false);
    }
  };

  const rename = async (project: VideoProject) => {
    const name = prompt("Nom de la miniature", project.name)?.trim();
    if (!name || name === project.name) return;
    await fetch(`/api/projects?id=${encodeURIComponent(project.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    load();
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
          <p className="text-sm text-muted-foreground">
            Un projet par vidéo, avec toutes ses variantes générées.
          </p>
        </div>
        <Button onClick={createProject} disabled={creating}>
          <Plus />
          {creating ? "Création…" : "Nouvelle miniature"}
        </Button>
      </header>

      {projects === null && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-56 rounded-xl" />
          ))}
        </div>
      )}

      {projects?.length === 0 && (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ImageIcon />
            </EmptyMedia>
            <EmptyTitle>Aucune miniature</EmptyTitle>
            <EmptyDescription>
              Crée ta première miniature : tu arriveras sur le canvas avec l&apos;agent prêt à chercher des
              références et à te proposer des axes.
            </EmptyDescription>
          </EmptyHeader>
          <Button onClick={createProject} disabled={creating}>
            <Plus />
            Nouvelle miniature
          </Button>
        </Empty>
      )}

      {projects && projects.length > 0 && (
        <div className="space-y-10">
          {projects.map((project) => (
            <section key={project.id}>
              <div className="mb-3 flex items-center gap-2">
                <button
                  onClick={() => router.push(`/m/${project.id}`)}
                  className="text-left text-base font-medium hover:underline"
                >
                  {project.name}
                </button>
                <Badge variant="secondary">
                  {project.imageCount} {project.imageCount > 1 ? "variantes" : "variante"}
                </Badge>
                <span className="text-xs text-muted-foreground">modifié le {formatDate(project.updatedAt)}</span>
                <div className="ml-auto flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => router.push(`/m/${project.id}`)}>
                    Ouvrir
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button variant="ghost" size="icon" aria-label={`Actions pour ${project.name}`}>
                          <MoreHorizontal />
                        </Button>
                      }
                    />
                    <DropdownMenuContent align="end">
                      <DropdownMenuGroup>
                        <DropdownMenuItem onClick={() => rename(project)}>
                          <Pencil />
                          Renommer
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => remove(project)} variant="destructive">
                          <Trash2 />
                          Supprimer
                        </DropdownMenuItem>
                      </DropdownMenuGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              {project.images.length === 0 ? (
                <Card
                  onClick={() => router.push(`/m/${project.id}`)}
                  className="cursor-pointer border-dashed py-0 transition-colors hover:border-ring"
                >
                  <CardContent className="flex items-center gap-3 py-6 text-sm text-muted-foreground">
                    <ImageIcon className="size-4" />
                    Aucune variante générée pour l&apos;instant — ouvre le canvas pour en créer une.
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {project.images.map((image) => (
                    <Card
                      key={image.id}
                      onClick={() => router.push(`/m/${project.id}`)}
                      className="cursor-pointer gap-0 py-0 transition-colors hover:border-ring"
                    >
                      <CardContent className="p-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={image.url}
                          alt={`Variante de ${project.name}`}
                          className="aspect-video w-full object-cover"
                          loading="lazy"
                        />
                      </CardContent>
                      <CardFooter className="justify-between py-2 text-xs text-muted-foreground">
                        <span>{formatDate(image.createdAt)}</span>
                        <span className="underline">Modifier</span>
                      </CardFooter>
                    </Card>
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}

      {unassigned.length > 0 && (
        <section className="mt-10">
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-base font-medium">Non classées</h2>
            <Badge variant="secondary">{unassigned.length}</Badge>
            <span className="text-xs text-muted-foreground">
              générées avant le suivi par projet, ou depuis un canvas modifié depuis
            </span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {unassigned.map((image) => (
              <Card key={image.id} className="gap-0 py-0">
                <CardContent className="p-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={image.url}
                    alt="Miniature non classée"
                    className="aspect-video w-full object-cover"
                    loading="lazy"
                  />
                </CardContent>
                <CardFooter className="py-2 text-xs text-muted-foreground">{formatDate(image.createdAt)}</CardFooter>
              </Card>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
