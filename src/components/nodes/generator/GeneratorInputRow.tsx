"use client";

import { Handle, Position } from "@xyflow/react";
import { PlusIcon, type LucideIcon } from "lucide-react";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { InputPreview } from "@/lib/canvas/generator-payload";

/**
 * One input of the Générateur: its target handle sits on the node's left edge,
 * vertically centred on this row (the row cancels NodeShell's px-3 padding).
 */
export default function GeneratorInputRow({
  handleId,
  icon: Icon,
  label,
  preview,
  inherited,
  addLabel,
  onAdd,
}: {
  handleId: string;
  icon: LucideIcon;
  label: string;
  preview: InputPreview;
  /** Unconnected B/C input showing variant A's input. */
  inherited: boolean;
  /** Tooltip of the « + » shown on an inherited row. */
  addLabel: string;
  onAdd: () => void;
}) {
  return (
    <div className="relative -mx-3 flex h-9 items-center gap-2 px-3">
      <Handle type="target" position={Position.Left} id={handleId} />
      <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <span className="w-28 shrink-0 truncate text-xs text-foreground">{label}</span>
      <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5">
        {inherited && (
          <Badge variant="outline" className="h-4 shrink-0 px-1.5 text-[10px]">
            hérité de A
          </Badge>
        )}
        {preview.kind === "image" && (
          <img
            src={preview.src}
            alt=""
            className={cn("size-7 shrink-0 rounded object-cover", inherited && "opacity-50")}
          />
        )}
        {preview.kind === "text" && (
          <span className={cn("min-w-0 truncate text-xs text-muted-foreground", inherited && "opacity-50")}>
            {preview.text}
          </span>
        )}
        {preview.kind !== "none" && preview.more > 0 && (
          <span className="shrink-0 text-[10px] text-muted-foreground">+{preview.more}</span>
        )}
        {preview.kind === "none" && (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="nodrag nopan text-muted-foreground"
            onClick={onAdd}
          >
            <PlusIcon />
            Ajouter
          </Button>
        )}
        {inherited && (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="nodrag nopan"
                  aria-label={addLabel}
                  onClick={onAdd}
                />
              }
            >
              <PlusIcon />
            </TooltipTrigger>
            <TooltipContent>{addLabel}</TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
