import { describeCurrentThumbnails } from "@/lib/canvas/current-thumbnail";
import { activeVariants, parseGeneratorHandle, resolveVariantInputs } from "@/lib/canvas/generator-variants";
import { selectedGeneratedImage, toImageSourceRef } from "@/lib/canvas/image-refs";
import { summarizeNode } from "@/lib/canvas/node-summary";
import { isEditSourceNode, type PayloadNode } from "@/lib/canvas/generator-payload";

export const BLUEPRINT_EXPORT_KIND = "thumbgen-blueprint";
export const BLUEPRINT_EXPORT_VERSION = 1;

const HOW_TO_USE =
  "Drop this JSON into a Cursor chat (or paste it). It describes HOW this ThumbGen canvas is wired — full prompts, generator models / A-B, character and logo refs, edges and handles, iterate vs scratch — so a coding agent can understand the functioning adjustments you want. Images are ids / urls / filenames only; pixels are omitted. Tombstones are omitted.";

const HANDLE_LEGEND: Record<string, string> = {
  "face-in": "Personnage (shared across A/B/C)",
  "logo-in": "Logo swipeFile (shared across A/B/C)",
  "prompt-in": "Prompt variant A",
  "prompt-in-b": "Prompt variant B",
  "prompt-in-c": "Prompt variant C",
  "sketch-in": "Sketch variant A",
  "sketch-in-b": "Sketch variant B",
  "sketch-in-c": "Sketch variant C",
  "ref-in": "Reference / edit-source variant A",
  "ref-in-b": "Reference / edit-source variant B",
  "ref-in-c": "Reference / edit-source variant C",
  "preview-in": "Aperçu input (generator output)",
  "image-in": "Text overlay input",
};

export type BlueprintExportNode = {
  id: string;
  type?: string;
  selected?: boolean;
  position?: { x: number; y: number };
  data?: Record<string, unknown>;
};

export type BlueprintExportEdge = {
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
};

export type BlueprintExportInput = {
  projectId: string;
  projectTitle: string;
  coverImageUrl?: string | null;
  nodes: BlueprintExportNode[];
  edges: BlueprintExportEdge[];
};

export type ImagePointer = {
  ref?: string;
  url?: string;
  filename?: string;
  note: string;
};

export type ExportedNode = {
  id: string;
  type: string;
  summary: Record<string, unknown>;
  prompt?: string;
  negativePrompt?: string;
  image?: ImagePointer;
  previewRole?: "winner" | "edit-source" | "output";
  selected?: true;
};

export type ExportedEdge = {
  source: string;
  target: string;
  targetHandle?: string | null;
  sourceHandle?: string | null;
};

export type GeneratorWiring = {
  id: string;
  model?: unknown;
  aspectRatio?: unknown;
  imageSize?: unknown;
  count?: unknown;
  abTest?: unknown;
  variants: Array<{
    variant: string;
    prompt: string;
    promptNode?: string;
    face: string[];
    logos: string[];
    sketch: string[];
    refs: string[];
    inherited: { prompt: boolean; sketch: boolean; ref: boolean };
    generatedApercuWiredAsEditSource: boolean;
  }>;
};

export type BlueprintExport = {
  kind: typeof BLUEPRINT_EXPORT_KIND;
  version: typeof BLUEPRINT_EXPORT_VERSION;
  howToUse: string;
  project: {
    id: string;
    title: string;
    winner?: { image: string; url?: string; nodeId?: string; role: "winner"; note: string };
  };
  intent: {
    mode: "scratch" | "iterate";
    why: string;
    generatedApercuWiredAsEditSource: boolean;
    editSources: Array<{ image: string; nodeId: string; role: "edit-source" }>;
  };
  nodes: ExportedNode[];
  edges: ExportedEdge[];
  generators: GeneratorWiring[];
  currentThumbnails?: ReturnType<typeof describeCurrentThumbnails>;
  handleLegend: Record<string, string>;
};

function isInlineBytes(value: string): boolean {
  return value.startsWith("data:") || (value.length > 240 && !value.startsWith("/") && !/^(stored:|generated:|uploaded:)/.test(value));
}

function filenameFromValue(value: string): string | undefined {
  if (isInlineBytes(value)) return undefined;
  try {
    const url = new URL(value, "http://thumbgen.local");
    const f = url.searchParams.get("f");
    if (f) return f;
    const id = url.searchParams.get("id");
    if (id) return id;
    const leaf = url.pathname.split("/").filter(Boolean).pop();
    return leaf || undefined;
  } catch {
    return undefined;
  }
}

function pointerFromValue(value: unknown, fallbackLabel?: unknown): ImagePointer | undefined {
  if (typeof value !== "string" || !value) return undefined;
  if (isInlineBytes(value)) {
    return {
      ...(typeof fallbackLabel === "string" && fallbackLabel ? { filename: fallbackLabel } : {}),
      note: "pixels omitted — canvas-upload / inline bytes; no reusable stored: ref",
    };
  }
  const ref = toImageSourceRef(value) ?? (/^(stored:|generated:|uploaded:)/.test(value) ? value : null);
  const url = value.startsWith("/") ? value : undefined;
  const filename = filenameFromValue(value);
  return {
    ...(ref ? { ref } : {}),
    ...(url ? { url } : {}),
    ...(filename ? { filename } : {}),
    note: ref ? "pixels omitted — reuse `ref` as image_source" : "pixels omitted — no reusable stored ref",
  };
}

function nodeImageValue(data: Record<string, unknown>): unknown {
  const selected = selectedGeneratedImage(data, false);
  return data.image_source ?? selected ?? data.imageUrl ?? data.imageBase64;
}

function storedGi(value: unknown): string | undefined {
  const ref = typeof value === "string" && value.startsWith("stored:gi_") ? value : toImageSourceRef(value);
  return ref?.startsWith("stored:gi_") ? ref : undefined;
}

function nodeGeneratedRef(node: BlueprintExportNode): string | undefined {
  const data = node.data ?? {};
  return storedGi(data.image_source) ?? storedGi(selectedGeneratedImage(data, false)) ?? storedGi(data.imageUrl);
}

function asPayload(node: BlueprintExportNode): PayloadNode {
  return { id: node.id, type: node.type, data: (node.data ?? {}) as PayloadNode["data"] };
}

function isRefInputHandle(handle: string | null | undefined): boolean {
  const parsed = parseGeneratorHandle(handle);
  return parsed?.kind === "input" && parsed.slot === "ref";
}

function previewRole(
  node: BlueprintExportNode,
  edges: BlueprintExportEdge[],
  winnerRef: string | undefined,
): ExportedNode["previewRole"] {
  const image = nodeGeneratedRef(node);
  if (winnerRef && image === winnerRef) return "winner";
  const wiredAsEdit = edges.some((edge) => edge.source === node.id && isRefInputHandle(edge.targetHandle));
  if (wiredAsEdit && image) return "edit-source";
  if (node.type === "preview" && image) return "output";
  return undefined;
}

function describeIntent(
  nodes: BlueprintExportNode[],
  edges: BlueprintExportEdge[],
  currentThumbnails: ReturnType<typeof describeCurrentThumbnails>,
): BlueprintExport["intent"] {
  const editSources: BlueprintExport["intent"]["editSources"] = [];
  for (const node of nodes) {
    const wired = edges.some((edge) => edge.source === node.id && isRefInputHandle(edge.targetHandle));
    if (!wired) continue;
    if (!isEditSourceNode(asPayload(node)) && !nodeGeneratedRef(node)) continue;
    const image = nodeGeneratedRef(node);
    if (!image) continue;
    editSources.push({ image, nodeId: node.id, role: "edit-source" });
  }
  const wired = editSources.length > 0;
  if (wired) {
    return {
      mode: "iterate",
      why: "A generated aperçu is wired on ref-in (or ref-in-b / ref-in-c). Generate is an edit of that image — short delta, same angle.",
      generatedApercuWiredAsEditSource: true,
      editSources,
    };
  }
  if (currentThumbnails.length > 0) {
    return {
      mode: "scratch",
      why: "A generated aperçu exists (preview / generator selected / currentThumbnails) but is not wired on ref-in as an edit source. Next generate is first-gen unless that image is connected to ref-in.",
      generatedApercuWiredAsEditSource: false,
      editSources,
    };
  }
  return {
    mode: "scratch",
    why: "No generated aperçu. First-gen / scratch: full 7-sentence prompts. Typical graph: Personnage on face-in, logos on logo-in, competitor swipe on ref-in.",
    generatedApercuWiredAsEditSource: false,
    editSources,
  };
}

function generatorWiring(nodes: BlueprintExportNode[], edges: BlueprintExportEdge[]): GeneratorWiring[] {
  return nodes
    .filter((node) => node.type === "generator")
    .map((node) => {
      const data = node.data ?? {};
      const variants = activeVariants(data.abTest).map((variant) => {
        const inputs = resolveVariantInputs(edges, nodes, node.id, variant);
        const promptNode = inputs.prompt.nodes.find((item) => item.type === "prompt");
        const prompt = typeof promptNode?.data?.prompt === "string" ? promptNode.data.prompt : "";
        const refs = inputs.ref.nodes;
        const generatedApercuWiredAsEditSource = refs.some((item) => {
          const image = nodeGeneratedRef(item);
          return Boolean(image && (isEditSourceNode(asPayload(item)) || image.startsWith("stored:gi_")));
        });
        return {
          variant,
          prompt,
          ...(promptNode ? { promptNode: promptNode.id } : {}),
          face: inputs.face.map((item) => item.id),
          logos: inputs.logo.map((item) => item.id),
          sketch: inputs.sketch.nodes.map((item) => item.id),
          refs: refs.map((item) => item.id),
          inherited: {
            prompt: inputs.prompt.inherited,
            sketch: inputs.sketch.inherited,
            ref: inputs.ref.inherited,
          },
          generatedApercuWiredAsEditSource,
        };
      });
      return {
        id: node.id,
        model: data.model,
        aspectRatio: data.aspectRatio,
        ...(data.imageSize !== undefined ? { imageSize: data.imageSize } : {}),
        count: data.count ?? data.numImages,
        ...(data.abTest !== undefined ? { abTest: data.abTest } : {}),
        variants,
      };
    });
}

export function blueprintExportFilename(projectId: string): string {
  const safe = projectId.replace(/[^\w.-]+/g, "_") || "project";
  return `thumbgen-blueprint-${safe}.json`;
}

export function stringifyBlueprintExport(doc: BlueprintExport): string {
  return JSON.stringify(doc, null, 2);
}

export function exportCanvasBlueprint(input: BlueprintExportInput): BlueprintExport {
  const winnerUrl = typeof input.coverImageUrl === "string" && input.coverImageUrl ? input.coverImageUrl : null;
  const winnerRef = winnerUrl ? storedGi(winnerUrl) : undefined;
  const winnerNode = winnerRef ? input.nodes.find((node) => nodeGeneratedRef(node) === winnerRef) : undefined;

  const viewNodes = input.nodes.map((node) => ({
    id: node.id,
    type: node.type,
    ...(node.selected ? { selected: true as const } : {}),
    summary: summarizeNode(node.type ?? "", node.data ?? {}),
  }));
  const viewEdges = input.edges.map((edge) => ({
    source: edge.source,
    target: edge.target,
    targetHandle: edge.targetHandle,
  }));
  const currentThumbnails = describeCurrentThumbnails(viewNodes, viewEdges);
  const intent = describeIntent(input.nodes, input.edges, currentThumbnails);

  const nodes: ExportedNode[] = input.nodes.map((node) => {
    const data = node.data ?? {};
    const summary = summarizeNode(node.type ?? "", data);
    const prompt = typeof data.prompt === "string" ? data.prompt : undefined;
    const negativePrompt = typeof data.negativePrompt === "string" ? data.negativePrompt : undefined;
    const image = pointerFromValue(nodeImageValue(data), data.label);
    const role = previewRole(node, input.edges, winnerRef);
    return {
      id: node.id,
      type: node.type ?? "unknown",
      summary,
      ...(prompt !== undefined ? { prompt } : {}),
      ...(negativePrompt !== undefined ? { negativePrompt } : {}),
      ...(image ? { image } : {}),
      ...(role ? { previewRole: role } : {}),
      ...(node.selected ? { selected: true as const } : {}),
    };
  });

  return {
    kind: BLUEPRINT_EXPORT_KIND,
    version: BLUEPRINT_EXPORT_VERSION,
    howToUse: HOW_TO_USE,
    project: {
      id: input.projectId,
      title: input.projectTitle,
      ...(winnerRef
        ? {
            winner: {
              image: winnerRef,
              ...(winnerUrl ? { url: winnerUrl } : {}),
              ...(winnerNode ? { nodeId: winnerNode.id } : {}),
              role: "winner" as const,
              note: "Gallery cover (miniature gagnante). Pixels omitted.",
            },
          }
        : {}),
    },
    intent,
    nodes,
    edges: input.edges.map((edge) => ({
      source: edge.source,
      target: edge.target,
      ...(edge.targetHandle !== undefined ? { targetHandle: edge.targetHandle } : {}),
      ...(edge.sourceHandle !== undefined ? { sourceHandle: edge.sourceHandle } : {}),
    })),
    generators: generatorWiring(input.nodes, input.edges),
    ...(currentThumbnails.length > 0 ? { currentThumbnails } : {}),
    handleLegend: HANDLE_LEGEND,
  };
}

export function triggerJsonDownload(filename: string, text: string): void {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

