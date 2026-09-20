"use client";

import { useEffect, useState } from "react";
import { Copy, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import {
  blueprintExportFilename,
  exportCanvasBlueprint,
  stringifyBlueprintExport,
  triggerJsonDownload,
} from "@/lib/canvas/export-blueprint";
import { useCanvasStore } from "@/store/canvas-store";

function useProjectTitle(projectId: string): string {
  const [title, setTitle] = useState("Mon projet");
  useEffect(() => {
    let cancelled = false;
    fetch("/api/projects")
      .then((r) => r.json() as Promise<Array<{ id: string; name: string }>>)
      .then((projects) => {
        if (cancelled) return;
        const name = projects.find((project) => project.id === projectId)?.name;
        if (name) setTitle(name);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [projectId]);
  return title;
}

export default function BlueprintExportButton() {
  const projectId = useCanvasStore((s) => s.currentProjectId);
  const title = useProjectTitle(projectId);

  const download = () => {
    const doc = exportCanvasBlueprint({
      projectId,
      projectTitle: title,
      coverImageUrl: useCanvasStore.getState().coverImageUrl,
      nodes: useCanvasStore.getState().nodes,
      edges: useCanvasStore.getState().edges,
    });
    triggerJsonDownload(blueprintExportFilename(projectId), stringifyBlueprintExport(doc));
  };

  const copy = async () => {
    const doc = exportCanvasBlueprint({
      projectId,
      projectTitle: title,
      coverImageUrl: useCanvasStore.getState().coverImageUrl,
      nodes: useCanvasStore.getState().nodes,
      edges: useCanvasStore.getState().edges,
    });
    try {
      await navigator.clipboard.writeText(stringifyBlueprintExport(doc));
      toast({ title: "Blueprint copié" });
    } catch {
      toast({ title: "Impossible de copier le blueprint" });
    }
  };

  return (
    <div className="flex items-center gap-1" data-blueprint-export data-project-title={title}>
      <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={download}>
        <Download data-icon="inline-start" />
        Exporter le blueprint
      </Button>
      <Button type="button" variant="outline" size="icon-sm" onClick={() => void copy()} title="Copier le blueprint" aria-label="Copier le blueprint">
        <Copy />
      </Button>
    </div>
  );
}
