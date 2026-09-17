"use client";

import { useReactFlow, useViewport } from "@xyflow/react";
import { useState, useEffect } from "react";
import { useAutoLayout } from "@/hooks/useAutoLayout";
import { useCanvasStore } from "@/store/canvas-store";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { MousePointer2, Hand, LayoutGrid, Undo2, Redo2, ChevronUp } from "lucide-react";
import AgentHistoryMenu from "./AgentHistoryMenu";

export default function ZoomBar() {
  const { zoomIn, zoomOut, fitView, zoomTo } = useReactFlow();
  const { zoom } = useViewport();
  const { undo, redo, canUndo, canRedo } = useCanvasStore();
  const [mode, setMode] = useState<"navigate" | "pan">("navigate");

  // Keyboard shortcuts for undo/redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "INPUT" || (e.target as HTMLElement).tagName === "TEXTAREA") return;
      if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo]);

  const zoomPercent = Math.round(zoom * 100);
  const autoLayout = useAutoLayout();

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 rounded-xl px-2 py-1.5 shadow-2xl bg-card border border-border">
      <ToggleGroup
        value={[mode]}
        onValueChange={(v) => {
          const next = v[0] as "navigate" | "pan" | undefined;
          if (next) setMode(next);
        }}
      >
        <Tooltip>
          <TooltipTrigger render={<ToggleGroupItem value="navigate" aria-label="Navigate" />}>
            <MousePointer2 className="size-4" />
          </TooltipTrigger>
          <TooltipContent><p>Navigate</p></TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger render={<ToggleGroupItem value="pan" aria-label="Pan" />}>
            <Hand className="size-4" />
          </TooltipTrigger>
          <TooltipContent><p>Pan</p></TooltipContent>
        </Tooltip>
      </ToggleGroup>

      <Tooltip>
        <TooltipTrigger render={<Button variant="ghost" size="icon" onClick={autoLayout} />}>
          <LayoutGrid className="size-4" />
        </TooltipTrigger>
        <TooltipContent><p>Ranger le workflow (⇧⌥T)</p></TooltipContent>
      </Tooltip>

      <Separator orientation="vertical" className="h-5 mx-1" />

      <Tooltip>
        <TooltipTrigger render={<Button variant="ghost" size="icon" onClick={undo} disabled={!canUndo()} />}>
          <Undo2 className="size-4" />
        </TooltipTrigger>
        <TooltipContent><p>Undo (Cmd+Z)</p></TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger render={<Button variant="ghost" size="icon" onClick={redo} disabled={!canRedo()} />}>
          <Redo2 className="size-4" />
        </TooltipTrigger>
        <TooltipContent><p>Redo (Cmd+Shift+Z)</p></TooltipContent>
      </Tooltip>
      <AgentHistoryMenu />

      <Separator orientation="vertical" className="h-5 mx-1" />

      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" className="gap-1 px-2 text-xs font-medium" />}>
          {zoomPercent}%
          <ChevronUp className="size-2.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top" className="min-w-[160px]">
          <DropdownMenuItem onClick={() => zoomIn()} className="justify-between">
            <span>Zoom avant</span>
            <span className="text-muted-foreground text-[10px]">Cmd +</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => zoomOut()} className="justify-between">
            <span>Zoom arrière</span>
            <span className="text-muted-foreground text-[10px]">Cmd -</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => zoomTo(1)} className="justify-between">
            <span>Zoom 100%</span>
            <span className="text-muted-foreground text-[10px]">Cmd 0</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => fitView({ padding: 0.1 })} className="justify-between">
            <span>Adapter à l&apos;écran</span>
            <span className="text-muted-foreground text-[10px]">Cmd 1</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
