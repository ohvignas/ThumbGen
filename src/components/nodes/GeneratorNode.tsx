"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Handle, Position, useUpdateNodeInternals, type NodeProps } from "@xyflow/react";
import {
  ChevronDownIcon,
  FlaskConicalIcon,
  ImageIcon,
  LoaderCircleIcon,
  PencilLineIcon,
  PlusIcon,
  ShapesIcon,
  SparklesIcon,
  StarIcon,
  TypeIcon,
  UserRoundIcon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "cn";
import { useCanvasStore, type AppNode } from "@/store/canvas-store";
import NodeShell from "./NodeShell";
import GeneratorInputRow from "./generator/GeneratorInputRow";
import { useGeneratorRun } from "./generator/useGeneratorRun";
import { subscribeNodeGeneration } from "@/lib/canvas/generate-node-event";
import ConfirmDialog from "@/components/settings/ConfirmDialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { inputPreview } from "@/lib/canvas/generator-payload";
import {
  COMMON_SLOTS,
  PER_VARIANT_SLOTS,
  activeVariants,
  edgesToRemoveForVariants,
  generationSummary,
  inputHandle,
  planGeneration,
  resolveVariantInputs,
  resultHandle,
  variantRemovalCopy,
  type InputSlot,
  type ResolvedVariantInputs,
  type VariantId,
  type VariantRemovalCopy,
} from "@/lib/canvas/generator-variants";
import {
  DEFAULT_IMAGE_MODEL,
  IMAGE_MODEL_GROUPS,
  IMAGE_MODELS,
  IMAGE_RESOLUTIONS,
  imageModelLabel,
} from "@/lib/image-models";
import { MODEL_COSTS, REFERENCE_CAPS } from "@/lib/model-costs";
import { ASPECT_RATIOS, type AspectRatio } from "@/lib/settings-schema";

const SLOT_META: Record<InputSlot, { label: string; icon: LucideIcon }> = {
  face: { label: "Personnage", icon: UserRoundIcon },
  logo: { label: "Logo", icon: ShapesIcon },
  prompt: { label: "Prompt", icon: TypeIcon },
  sketch: { label: "Croquis", icon: PencilLineIcon },
  ref: { label: "Image de référence", icon: ImageIcon },
};

const ASPECT_LABELS: Record<AspectRatio, string> = { "16x9": "16:9", "9x16": "9:16", "1x1": "1:1" };
const IMAGE_COUNTS = [1, 2, 3, 4] as const;
const MODEL_ITEMS = IMAGE_MODELS.map((m) => ({ value: m.id, label: m.label }));

function priceLabel(modelId: string): string {
  const cost = MODEL_COSTS[modelId];
  return cost ? `~$${cost.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")}` : "";
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{children}</p>;
}

function FieldLabel({ children }: { children: ReactNode }) {
  return <p className="text-xs text-muted-foreground">{children}</p>;
}

type PendingRemoval = { variants: VariantId[]; copy: VariantRemovalCopy };

export default function GeneratorNode({ id, data, positionAbsoluteX, positionAbsoluteY }: NodeProps<AppNode>) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const removeNode = useCanvasStore((s) => s.removeNode);
  const setGeneratorVariants = useCanvasStore((s) => s.setGeneratorVariants);
  const openNodePicker = useCanvasStore((s) => s.openNodePicker);
  const edges = useCanvasStore((s) => s.edges);
  const nodes = useCanvasStore((s) => s.nodes);
  const updateNodeInternals = useUpdateNodeInternals();
  const { run, error } = useGeneratorRun(id);
  const [compareModels, setCompareModels] = useState<string[]>([]);
  // `pendingRemoval` keeps the last removal copy even after the dialog is
  // asked to close, so its ~100ms close animation doesn't show blanked
  // title/description; only a new confirmation request replaces it.
  const [removalOpen, setRemovalOpen] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState<PendingRemoval | null>(null);

  const model = data.model || DEFAULT_IMAGE_MODEL;
  const aspectRatio = data.aspectRatio || "16x9";
  const numImages = data.numImages || 1;
  const variantsKey = activeVariants(data.abTest).join("");
  const variants = useMemo(() => variantsKey.split("") as VariantId[], [variantsKey]);
  const abActive = variants.length > 1;

  // « Générer » clicked in the chat (finish_turn generate action): same run and guards as the button below.
  useEffect(
    () =>
      subscribeNodeGeneration(id, () => {
        void run([]);
      }),
    [id, run],
  );

  // Handles mount and unmount with the variants: React Flow must re-measure them.
  useEffect(() => {
    updateNodeInternals(id);
  }, [id, variantsKey, updateNodeInternals]);

  const resolved = useMemo(
    () => variants.map((variant) => resolveVariantInputs(edges, nodes, id, variant)),
    [edges, nodes, id, variants],
  );
  const inputsA = resolved[0];

  const inputsByVariant: Partial<Record<VariantId, ResolvedVariantInputs<AppNode>>> = {};
  for (const inputs of resolved) inputsByVariant[inputs.variant] = inputs;
  const summary = generationSummary(
    planGeneration({ model, numImages, abTest: data.abTest, compareModels }, inputsByVariant),
    abActive,
  );
  const faceIgnored = inputsA.face.length > 0 && REFERENCE_CAPS[model]?.characters === 0;

  const openPicker = (handleId: string, rowIndex: number) =>
    openNodePicker({
      mode: "connect",
      flowPos: { x: positionAbsoluteX - 400, y: positionAbsoluteY + rowIndex * 90 },
      from: { nodeId: id, handleId, handleType: "target" },
    });

  // Going to fewer variants removes the edges of the dropped ones: confirm first when there are any.
  // Adding variants never drops anything, so it always applies immediately —
  // this also guards against a nonsensical removal dialog if stray edges
  // were ever misclassified as belonging to a dropped variant.
  const requestVariants = (next: VariantId[]) => {
    if (next.length >= variants.length) {
      setGeneratorVariants(id, next);
      return;
    }
    const dropped = edgesToRemoveForVariants(edges, id, next);
    if (dropped.length === 0) {
      setGeneratorVariants(id, next);
      return;
    }
    setPendingRemoval({ variants: next, copy: variantRemovalCopy(variants, next, dropped.length) });
    setRemovalOpen(true);
  };

  const toggleCompareModel = (modelId: string) =>
    setCompareModels((prev) => (prev.includes(modelId) ? prev.filter((m) => m !== modelId) : [...prev, modelId]));

  const saveFavorite = () => {
    void fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ favoriteModel: model }),
    }).catch(() => {});
  };

  const renderRow = (slot: InputSlot, inputs: ResolvedVariantInputs<AppNode>, rowIndex: number) => {
    const slotInputs = slot === "face" || slot === "logo" ? { nodes: inputs[slot], inherited: false } : inputs[slot];
    const handleId = inputHandle(slot, inputs.variant);
    return (
      <GeneratorInputRow
        key={handleId}
        handleId={handleId}
        icon={SLOT_META[slot].icon}
        label={SLOT_META[slot].label}
        preview={inputPreview(slot, slotInputs.nodes)}
        inherited={slotInputs.inherited}
        addLabel={`Ajouter pour la variante ${inputs.variant}`}
        onAdd={() => openPicker(handleId, rowIndex)}
      />
    );
  };

  return (
    <NodeShell
      title={data.label || "Générateur"}
      icon={<SparklesIcon className="size-4 text-(--canvas-accent)" />}
      headerExtra={
        <Badge variant="secondary" className="max-w-36">
          <span className="truncate">{imageModelLabel(model)}</span>
        </Badge>
      }
      onRename={(label) => updateNodeData(id, { label })}
      onDelete={() => removeNode(id)}
      width={340}
    >
      <div className="space-y-3">
        <section aria-label="Entrées">
          {abActive && <SectionTitle>Commun</SectionTitle>}
          {COMMON_SLOTS.map((slot, index) => renderRow(slot, inputsA, index))}
          {resolved.map((inputs, variantIndex) => (
            <div key={inputs.variant}>
              {abActive && (
                <div className="relative -mx-3 mt-2 flex h-10 items-center justify-between px-3">
                  <SectionTitle>Variante {inputs.variant}</SectionTitle>
                  {inputs.variant === "C" && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      className="nodrag nopan"
                      onClick={() => requestVariants(["A", "B"])}
                    >
                      Retirer
                    </Button>
                  )}
                  <Handle type="source" position={Position.Right} id={resultHandle(inputs.variant)} />
                </div>
              )}
              {PER_VARIANT_SLOTS.map((slot, index) =>
                renderRow(slot, inputs, COMMON_SLOTS.length + variantIndex * PER_VARIANT_SLOTS.length + index),
              )}
            </div>
          ))}
          {abActive && variants.length === 2 && (
            <Button
              type="button"
              variant="outline"
              size="xs"
              className="nodrag nopan mt-2 w-full"
              onClick={() => requestVariants(["A", "B", "C"])}
            >
              <PlusIcon />
              Variante C
            </Button>
          )}
        </section>

        <section aria-label="Réglages" className="space-y-3 border-t border-border pt-3">
          <div className="space-y-1.5">
            <FieldLabel>Modèle</FieldLabel>
            <div className="flex gap-1">
              <Select
                items={MODEL_ITEMS}
                value={model}
                onValueChange={(value) => {
                  if (value) updateNodeData(id, { model: value });
                }}
              >
                <SelectTrigger size="sm" className="nodrag nopan min-w-0 flex-1" aria-label="Modèle">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  {IMAGE_MODEL_GROUPS.map((group) => (
                    <SelectGroup key={group}>
                      <SelectLabel>{group}</SelectLabel>
                      {IMAGE_MODELS.filter((m) => m.group === group).map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.label}
                          <span className="text-muted-foreground">{priceLabel(m.id)}</span>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      className="nodrag nopan"
                      aria-label="Définir comme modèle par défaut"
                      onClick={saveFavorite}
                    />
                  }
                >
                  <StarIcon />
                </TooltipTrigger>
                <TooltipContent>Définir comme modèle par défaut</TooltipContent>
              </Tooltip>
            </div>
            {faceIgnored && (
              <p className="text-[11px] text-destructive">
                {imageModelLabel(model)} ne prend pas en compte les visages : le personnage branché sera ignoré.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <FieldLabel>Format</FieldLabel>
            <ToggleGroup
              variant="outline"
              size="sm"
              spacing={0}
              className="nodrag nopan w-full"
              aria-label="Format"
              value={(ASPECT_RATIOS as readonly string[]).includes(aspectRatio) ? [aspectRatio] : []}
              onValueChange={(value) => {
                const next = ASPECT_RATIOS.find((ratio) => ratio === value[0]);
                if (next) updateNodeData(id, { aspectRatio: next });
              }}
            >
              {ASPECT_RATIOS.map((ratio) => (
                <ToggleGroupItem key={ratio} value={ratio} className="flex-1">
                  {ASPECT_LABELS[ratio]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>

          <div className="space-y-1.5">
            <FieldLabel>Résolution{data.imageSize ? "" : " · réglage par défaut"}</FieldLabel>
            <ToggleGroup
              variant="outline"
              size="sm"
              spacing={0}
              className="nodrag nopan w-full"
              aria-label="Résolution"
              value={data.imageSize ? [data.imageSize] : []}
              onValueChange={(value) => {
                const next = IMAGE_RESOLUTIONS.find((size) => size === value[0]);
                if (next) updateNodeData(id, { imageSize: next });
              }}
            >
              {IMAGE_RESOLUTIONS.map((size) => (
                <ToggleGroupItem key={size} value={size} className="flex-1">
                  {size}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>

          <div className="space-y-1.5">
            <FieldLabel>{abActive ? "Images par variante" : "Images"}</FieldLabel>
            <ToggleGroup
              variant="outline"
              size="sm"
              spacing={0}
              className="nodrag nopan w-full"
              aria-label="Images"
              value={[String(numImages)]}
              onValueChange={(value) => {
                const next = IMAGE_COUNTS.find((count) => String(count) === value[0]);
                if (next) updateNodeData(id, { numImages: next });
              }}
            >
              {IMAGE_COUNTS.map((count) => (
                <ToggleGroupItem key={count} value={String(count)} className="flex-1">
                  {count}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>

          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs text-foreground">
              <FlaskConicalIcon className="size-3.5 text-muted-foreground" aria-hidden />
              Test A/B
            </span>
            <Switch
              size="sm"
              className="nodrag nopan"
              aria-label="Test A/B"
              checked={abActive}
              onCheckedChange={(checked) => requestVariants(checked ? ["A", "B"] : ["A"])}
            />
          </div>

          <Collapsible>
            <CollapsibleTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  className="nodrag nopan w-full justify-between px-1 text-muted-foreground"
                />
              }
            >
              Avancé
              <ChevronDownIcon className="transition-transform group-data-[panel-open]/button:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-1 pt-1">
              <FieldLabel>Comparer des modèles</FieldLabel>
              {abActive && (
                <p className="text-[11px] text-muted-foreground">
                  Indisponible en test A/B : toutes les variantes utilisent le modèle principal.
                </p>
              )}
              {IMAGE_MODELS.filter((m) => m.id !== model).map((m) => (
                <label
                  key={m.id}
                  className={cn(
                    "nodrag nopan flex items-center gap-2 rounded-md px-1 py-1 text-xs",
                    abActive ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-muted",
                    !abActive && compareModels.includes(m.id) && "bg-muted",
                  )}
                >
                  <input
                    type="checkbox"
                    className="accent-primary"
                    checked={compareModels.includes(m.id)}
                    disabled={abActive}
                    onChange={() => toggleCompareModel(m.id)}
                  />
                  <span className="min-w-0 flex-1 truncate">{m.label}</span>
                  <span className="text-muted-foreground">{priceLabel(m.id)}</span>
                </label>
              ))}
            </CollapsibleContent>
          </Collapsible>
        </section>

        {/* In normal mode the single output sits next to the button; in A/B mode each variant title carries its own. */}
        <div className="relative -mx-3 px-3">
          <Button
            type="button"
            className="nodrag nopan h-auto w-full flex-col gap-0.5 py-2"
            disabled={Boolean(data.isGenerating)}
            onClick={() => void run(compareModels)}
          >
            {data.isGenerating ? (
              <span className="flex items-center gap-1.5">
                <LoaderCircleIcon className="animate-spin" />
                Génération en cours…
              </span>
            ) : (
              <>
                <span>Générer</span>
                <span className="text-xs font-normal opacity-80">{summary}</span>
              </>
            )}
          </Button>
          {!abActive && <Handle type="source" position={Position.Right} id={resultHandle("A")} />}
        </div>

        {error && (
          <Alert variant="destructive" className="px-2.5 py-1.5">
            <AlertDescription className="text-xs">{error}</AlertDescription>
          </Alert>
        )}

        {/*
          ConfirmDialog's content is a portal, but React still bubbles its
          events through this React tree (not the DOM tree) up to React
          Flow's node wrapper — Backspace/Delete on a focused dialog button
          would otherwise delete this node, and a right-click inside the
          dialog would otherwise open the canvas's node context menu.
          `nokey` covers the delete key: React Flow's delete-key listener
          skips any input/textarea/contenteditable target, and — via the
          same internal check — anything under a `.nokey` ancestor too,
          which `contentClassName="nokey"` below sets. (`nokey` is also
          read in an unrelated place, React Flow's pane pointer-down
          capture for starting a box selection — not relevant here.)
          Stopping the contextmenu here covers the right-click, which
          Canvas.tsx has no such convention for.
        */}
        <div onContextMenu={(event) => event.stopPropagation()}>
          <ConfirmDialog
            open={removalOpen}
            onOpenChange={setRemovalOpen}
            title={pendingRemoval?.copy.title ?? ""}
            description={pendingRemoval?.copy.description ?? ""}
            confirmLabel={pendingRemoval?.copy.confirmLabel ?? "Confirmer"}
            contentClassName="nokey"
            onConfirm={() => {
              if (pendingRemoval) setGeneratorVariants(id, pendingRemoval.variants);
              setRemovalOpen(false);
            }}
          />
        </div>
      </div>
    </NodeShell>
  );
}
