"use client";

import Link from "next/link";
import { ImagePlus, Plus, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { LinkedStudioProject } from "@/lib/studio/link-project";

const SLOTS = ["A", "B", "C"] as const;

export default function LinkedThumbs({
  projects,
  onLinkClick,
  onCreateClick,
  onUnlinkClick,
}: {
  projects: LinkedStudioProject[];
  onLinkClick: () => void;
  onCreateClick: () => void;
  onUnlinkClick?: (projectId: string) => void;
}) {
  return (
    <section className="mt-8 grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-heading text-lg font-medium">Miniatures A/B</h2>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" className="min-h-11" onClick={onLinkClick}>
            <Plus />
            Lier une miniature
          </Button>
          <Button type="button" className="min-h-11" onClick={onCreateClick}>
            <ImagePlus />
            Créer une miniature
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {SLOTS.map((slot) => {
          const project = projects.find((candidate) => candidate.slot === slot);
          return (
            <div
              key={slot}
              data-thumb-slot={slot}
              className="group relative aspect-video overflow-hidden rounded-xl border bg-muted"
            >
              <span className="absolute top-2 left-2 z-10 grid size-7 place-items-center rounded-full bg-background/90 text-xs font-semibold shadow-sm">
                {slot}
              </span>
              {project ? (
                <>
                  <Link
                    href={`/m/${project.id}`}
                    aria-label={`Ouvrir ${project.name}`}
                    className="block size-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                  >
                    {project.coverImageUrl ? (
                      <img
                        src={project.coverImageUrl}
                        alt={project.name}
                        className="size-full object-cover transition-transform duration-300 motion-reduce:transition-none motion-safe:group-hover:scale-[1.02]"
                      />
                    ) : (
                      <span className="flex size-full items-center justify-center bg-linear-to-br from-violet-500 to-fuchsia-600">
                        <ImagePlus aria-hidden className="size-10 text-white drop-shadow-sm" />
                      </span>
                    )}
                    <span className="absolute right-0 bottom-0 left-0 bg-linear-to-t from-black/80 to-transparent px-3 pt-8 pb-2 text-sm font-medium text-white">
                      {project.name}
                    </span>
                  </Link>
                  {onUnlinkClick && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon"
                      className="absolute top-2 right-2 z-10 min-h-11 min-w-11"
                      aria-label={`Délier ${project.name}`}
                      onClick={() => onUnlinkClick(project.id)}
                    >
                      <Unlink />
                    </Button>
                  )}
                </>
              ) : (
                <div className="flex size-full items-center justify-center">
                  <ImagePlus aria-hidden className="size-9 text-muted-foreground/50" />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {projects.length === 0 && (
        <p className="text-sm text-muted-foreground">Aucune miniature liée — lie un projet canvas pour tester A/B.</p>
      )}
    </section>
  );
}
