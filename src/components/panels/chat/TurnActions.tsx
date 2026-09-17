"use client";
import { useReactFlow } from "@xyflow/react";
import { CornerDownLeftIcon, CrosshairIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useCanvasStore } from "@/store/canvas-store";
import type { NextAction } from "./turn-model";

/** Selects a canvas node and centers the view on it; disabled when the node is gone. */
function FocusNodeButton({ label, nodeId }: { label: string; nodeId: string }) {
  const exists = useCanvasStore((s) => s.nodes.some((node) => node.id === nodeId));
  const { fitView } = useReactFlow();

  const focus = () => {
    useCanvasStore.getState().selectOnly([nodeId]);
    void fitView({ nodes: [{ id: nodeId }], padding: 0.4, maxZoom: 1, duration: 400 });
  };

  if (exists) {
    return (
      <Button variant="outline" size="sm" onClick={focus}>
        <CrosshairIcon data-icon="inline-start" />
        {label}
      </Button>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button variant="outline" size="sm" disabled focusableWhenDisabled className="data-disabled:opacity-50">
            <CrosshairIcon data-icon="inline-start" />
            {label}
          </Button>
        }
      />
      <TooltipContent>
        <p>Élément introuvable</p>
      </TooltipContent>
    </Tooltip>
  );
}

/** « Et maintenant » : the 1 to 3 follow-ups the agent offered at the end of the last turn. */
export default function TurnActions({ actions, onAskAgent }: { actions: NextAction[]; onAskAgent: (message: string) => void }) {
  if (actions.length === 0) return null;

  return (
    <div role="group" aria-label="Et maintenant" className="flex flex-col gap-1.5">
      <p className="text-xs font-medium text-muted-foreground">Et maintenant</p>
      <div className="flex flex-wrap gap-1.5">
        {actions.map((action, index) =>
          action.kind === "ask_agent" ? (
            <Button key={index} variant="outline" size="sm" onClick={() => onAskAgent(action.message)}>
              <CornerDownLeftIcon data-icon="inline-start" />
              {action.label}
            </Button>
          ) : (
            <FocusNodeButton key={index} label={action.label} nodeId={action.nodeId} />
          ),
        )}
      </div>
    </div>
  );
}
