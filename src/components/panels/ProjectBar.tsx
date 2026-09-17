"use client";

import { useState, useEffect, useRef } from "react";
import { useCanvasStore } from "@/store/canvas-store";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FolderOpen, ChevronDown, Pencil, Trash2, Plus } from "lucide-react";

type ProjectMeta = { id: string; name: string; createdAt: string; updatedAt: string };

export default function ProjectBar() {
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  // The canvas store is the source of truth: /m/<id> loads a project straight
  // into it, so reading settings here instead would race that route load and
  // leave the bar naming the previously-opened project.
  const currentId = useCanvasStore((s) => s.currentProjectId);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameRef = useRef<HTMLInputElement>(null);
  const loadProject = useCanvasStore((s) => s.loadProject);

  const loadProjects = () => {
    fetch("/api/projects").then((r) => r.json()).then(setProjects).catch(() => {});
  };

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    if (renaming && renameRef.current) {
      renameRef.current.focus();
      renameRef.current.select();
    }
  }, [renaming]);

  const switchProject = async (projectId: string) => {
    setMenuOpen(false);
    await loadProject(projectId);
    fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentProjectId: projectId }),
    }).catch(() => {});
  };

  const createProject = async () => {
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Nouveau projet" }),
    });
    const { id } = await res.json();
    loadProjects();
    await switchProject(id);
  };

  const renameProject = async (projectId: string, name: string) => {
    await fetch(`/api/projects?id=${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setRenaming(null);
    loadProjects();
  };

  const deleteProject = async (projectId: string) => {
    if (!confirm("Supprimer ce projet et toutes ses données ?")) return;
    await fetch(`/api/projects?id=${projectId}`, { method: "DELETE" });
    const remaining = projects.filter((p) => p.id !== projectId);
    if (remaining.length === 0 || currentId === projectId) {
      if (remaining.length === 0) {
        await createProject();
      } else {
        await switchProject(remaining[0].id);
        loadProjects();
      }
    } else {
      loadProjects();
    }
  };

  const currentProject = projects.find((p) => p.id === currentId);

  return (
    <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
      <DropdownMenuTrigger render={<Button variant="outline" className="gap-2" />}>
        <FolderOpen className="size-3.5" />
        {currentProject?.name || "Mon projet"}
        <ChevronDown className="size-2.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[260px] max-h-64 overflow-y-auto">
        {projects.map((p) => (
          <DropdownMenuItem
            key={p.id}
            className="group gap-2"
            closeOnClick={renaming !== p.id}
            onClick={() => {
              if (renaming === p.id) return;
              switchProject(p.id);
            }}
          >
            {p.id === currentId && <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />}
            {renaming === p.id ? (
              <Input
                ref={renameRef}
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={() => { if (renameValue.trim()) renameProject(p.id, renameValue.trim()); else setRenaming(null); }}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter" && renameValue.trim()) renameProject(p.id, renameValue.trim());
                  if (e.key === "Escape") setRenaming(null);
                }}
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                className="h-6 flex-1 text-xs"
              />
            ) : (
              <span className={`flex-1 truncate text-xs ${p.id === currentId ? "text-foreground" : "text-muted-foreground pl-[14px]"}`}>{p.name}</span>
            )}
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 shrink-0">
              <button
                onClick={(e) => { e.stopPropagation(); setRenameValue(p.name); setRenaming(p.id); }}
                onPointerDown={(e) => e.stopPropagation()}
                className="p-1 rounded text-muted-foreground hover:text-foreground"
                title="Renommer"
              >
                <Pencil className="size-2.5" />
              </button>
              {projects.length > 0 && (
                <button
                  onClick={(e) => { e.stopPropagation(); deleteProject(p.id); }}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="p-1 rounded text-destructive"
                  title="Supprimer"
                >
                  <Trash2 className="size-2.5" />
                </button>
              )}
            </div>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => createProject()} className="gap-2 text-muted-foreground">
          <Plus className="size-3" />
          Nouveau projet
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
