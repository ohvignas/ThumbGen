import type { LanguageModelV3CallOptions, LanguageModelV3StreamPart } from "@ai-sdk/provider";
import { BLUEPRINT_MODELS } from "@/lib/agent/blueprint/models";
import { formatUsdEstimate } from "@/lib/canvas/generate-action";
import { MODEL_COSTS } from "@/lib/model-costs";

/**
 * DEV ONLY (chantier F2): the guided interview played by the fake agent model
 * (THUMBGEN_FAKE_AGENT=interview), so the question card, the resume after an
 * answer, the live canvas patches and the « Générer » recap can be checked in
 * a browser without any model call. It decides each step from the last prompt
 * message only, like a stateless model.
 */

export type FakeLibraryItem = { id: string; title: string };

const USAGE = {
  inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 0, text: 0, reasoning: 0 },
};

const ANGLES = [
  { id: "choc", label: "Choc", description: "Un visage choqué devant le résultat." },
  { id: "duel", label: "Duel", description: "Avant / après, côte à côte." },
  { id: "demo", label: "Démo", description: "Le produit en action, gros plan." },
];

let counter = 0;

function textOf(options: LanguageModelV3CallOptions): string {
  return options.prompt
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n");
}

function projectIdOf(options: LanguageModelV3CallOptions): string {
  return textOf(options).match(/<project_id>([^<]+)<\/project_id>/)?.[1] ?? "";
}

/** One model step: a short sentence, then one tool call. */
function step(sentence: string, toolName: string, input: unknown, key = toolName): LanguageModelV3StreamPart[] {
  const stamp = `${Date.now().toString(36)}${(counter++).toString(36)}`;
  const id = `fake-text-${stamp}`;
  return [
    { type: "stream-start", warnings: [] },
    { type: "text-start", id },
    ...sentence.split(/(?<= )/).map((delta) => ({ type: "text-delta" as const, id, delta })),
    { type: "text-end", id },
    { type: "tool-call", toolCallId: `fake-${key}-${stamp}`, toolName, input: JSON.stringify(input) },
    { type: "finish", usage: USAGE, finishReason: { unified: "tool-calls", raw: "tool-calls" } },
  ];
}

const ask = (key: string, input: Record<string, unknown>) => step("Question suivante.", "ask_user", { allow_skip: true, ...input }, `ask-${key}`);

const askVideo = () =>
  ask("video", {
    question: "De quoi parle la vidéo ?",
    step: 1,
    options: [
      { id: "tuto", label: "Un tutoriel", description: "Pas à pas, écran et visage." },
      { id: "test", label: "Un test produit", description: "Avis honnête après une semaine." },
    ],
  });

const askModel = () =>
  ask("model", {
    question: "Quel modèle pour générer ?",
    step: 8,
    options: BLUEPRINT_MODELS.map((model) => ({
      id: model.id,
      label: `${model.name} · ${formatUsdEstimate(MODEL_COSTS[model.canvasModel] ?? 0)} / image`,
    })),
  });

const finish = (summary: string, nextActions: unknown[] = []) =>
  step("Je résume.", "finish_turn", { summary, results: [], next_actions: nextActions });

const placeNode = (node: Record<string, unknown>) => step("Je pose le nœud.", "place_node", { node });

type ToolResultPart = { type: "tool-result"; toolCallId: string; toolName: string; output: unknown };

function selectedOf(output: unknown): string[] {
  const value = (output as { type?: string; value?: unknown } | null)?.value;
  const selected = (value as { selected?: unknown } | null)?.selected;
  return Array.isArray(selected) ? selected.filter((id): id is string => typeof id === "string") : [];
}

export function interviewScript(options: LanguageModelV3CallOptions, library: FakeLibraryItem[]): LanguageModelV3StreamPart[] {
  const last = options.prompt.at(-1);

  if (last?.role !== "tool") {
    const interviewIds = [...new Set([...textOf(options).matchAll(/"id":\s*"(iv-[\w-]+)"/g)].map((match) => match[1]))];
    if (interviewIds.length > 0) {
      return ask("resume", {
        question: "Une interview a déjà construit des nœuds sur ce canvas.",
        step: 1,
        options: [
          { id: "resume", label: "Reprendre l'interview" },
          { id: "restart", label: "Repartir de zéro" },
        ],
        allow_skip: false,
      });
    }
    return askVideo();
  }

  const result = (last.content as Array<{ type: string }>).find((part): part is ToolResultPart => part.type === "tool-result");
  if (!result) return finish("Interview simulée interrompue.");
  const serialized = JSON.stringify(result.output);

  if (result.toolName === "ask_user") {
    const key = result.toolCallId.match(/^fake-ask-([a-z]+)-/)?.[1];
    const selected = selectedOf(result.output);
    switch (key) {
      case "resume": {
        if (!selected.includes("restart")) return finish("On reprend là où l'interview s'était arrêtée.");
        const ids = [...new Set([...textOf(options).matchAll(/"id":\s*"(iv-[\w-]+)"/g)].map((match) => match[1]))];
        return step("Je repars de zéro.", "apply_workflow", {
          project_id: projectIdOf(options),
          blueprint: { nodes: [], edges: [] },
          remove_node_ids: ids,
        });
      }
      case "video":
        return ask("angle", { question: "Quel angle ?", step: 2, options: ANGLES });
      case "angle": {
        const angle = ANGLES.find((option) => option.id === selected[0]) ?? ANGLES[0];
        return placeNode({ id: "iv-prompt", type: "prompt", data: { prompt: `Miniature « ${angle.label} » : ${angle.description}` } });
      }
      case "refs":
        return selected[0]
          ? placeNode({ id: "iv-ref-1", type: "swipeFile", data: { kind: "reference", image_source: `stored:sf_${selected[0]}` } })
          : askModel();
      case "model": {
        const model = BLUEPRINT_MODELS.find((option) => option.id === selected[0]) ?? BLUEPRINT_MODELS[0];
        return placeNode({ id: "iv-generator", type: "generator", data: { model: model.id, aspectRatio: "16x9", count: 1 } });
      }
      default:
        return finish("Interview simulée terminée.");
    }
  }

  if (result.toolName === "apply_workflow") return askVideo();

  if (result.toolName === "place_node") {
    if (/error/i.test(String((result.output as { type?: string } | null)?.type))) {
      return finish("Désolé, le nœud n'a pas pu être posé.");
    }
    if (serialized.includes("node id: iv-prompt")) {
      if (library.length === 0) return askModel();
      return ask("refs", {
        question: "Quelles références ?",
        step: 4,
        multiple: true,
        max_selected: Math.min(3, library.length),
        options: library.slice(0, 6).map((item) => ({ id: item.id, label: item.title.slice(0, 60), image: `stored:sf_${item.id}` })),
      });
    }
    if (serialized.includes("node id: iv-ref-1")) return askModel();
    if (serialized.includes("node id: iv-generator")) {
      return finish("Le workflow de ta miniature est prêt : prompt, référence et générateur.", [
        { kind: "generate", node_id: "iv-generator" },
      ]);
    }
  }

  return finish("Interview simulée terminée.");
}
