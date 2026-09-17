"use client";
import { useReactFlow } from "@xyflow/react";
import { CornerDownLeftIcon, CrosshairIcon, SparklesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { generateActionState } from "@/lib/canvas/generate-action";
import { requestNodeGeneration } from "@/lib/canvas/generate-node-event";
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

/**
 * « Générer » on a generator node (finish_turn `generate`): the label and cost
 * come from the node as it is now. A click selects and centers the node, then
 * asks it to run — the node's own run starts the paid generation. Nothing
 * here ever runs outside that click.
 */
function GenerateNodeButton({ nodeId }: { nodeId: string }) {
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
  const { fitView } = useReactFlow();
  const state = generateActionState(nodeId, nodes, edges);

  if (state.status === "missing") {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <Button size="sm" disabled focusableWhenDisabled className="data-disabled:opacity-50">
              <SparklesIcon data-icon="inline-start" />
              Générer
            </Button>
          }
        />
        <TooltipContent>
          <p>Élément introuvable</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  if (state.status === "generating") {
    return (
      <Button size="sm" disabled>
        <Spinner data-icon="inline-start" />
        Génération en cours…
      </Button>
    );
  }

  const generate = () => {
    useCanvasStore.getState().selectOnly([nodeId]);
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    void fitView({ nodes: [{ id: nodeId }], padding: 0.4, maxZoom: 1, duration: reducedMotion ? 0 : 400 });
    requestNodeGeneration(nodeId);
  };

  return (
    <Button size="sm" onClick={generate}>
      <SparklesIcon data-icon="inline-start" />
      {state.label}
    </Button>
  );
}

/** « Et maintenant » : the 1 to 3 follow-ups the agent offered at the end of the last turn. */
export default function TurnActions({ actions, onAskAgent }: { actions: NextAction[]; onAskAgent: (message: string) => void }) {
  if (actions.length === 0) return null;

  return (
    <div role="group" aria-label="Et maintenant" className="flex flex-col gap-1.5">
      <p className="text-xs font-medium text-muted-foreground">Et maintenant</p>
      <div className="flex flex-wrap gap-1.5">
        {actions.map((action, index) => {
          if (action.kind === "ask_agent") {
            return (
              <Button key={index} variant="outline" size="sm" onClick={() => onAskAgent(action.message)}>
                <CornerDownLeftIcon data-icon="inline-start" />
                {action.label}
              </Button>
            );
          }
          if (action.kind === "generate") return <GenerateNodeButton key={index} nodeId={action.nodeId} />;
          return <FocusNodeButton key={index} label={action.label} nodeId={action.nodeId} />;
        })}
      </div>
    </div>
  );
}
