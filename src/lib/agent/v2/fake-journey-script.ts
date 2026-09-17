import type { LanguageModelV3CallOptions, LanguageModelV3StreamPart } from "@ai-sdk/provider";

/**
 * DEV ONLY (chantier F3a): the thumbnail journey played by the fake agent
 * model (THUMBGEN_FAKE_AGENT=journey) — steps 1, 4, 5, 6 and the provisional
 * step 7 (apply_workflow for an A/B test, place_node for one package) — so the
 * question cards, the brief (« Fiche », badge, step line) and the live canvas
 * can be checked in a browser without any model call. Never generate_sketch
 * (no fixtures before F3c). Stateless like a model: every decision comes from
 * the prompt (the last tool result and earlier answers).
 */

export type FakePersona = { id: string; label: string };

const USAGE = {
  inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 0, text: 0, reasoning: 0 },
};

const PACKAGES = [
  {
    id: "pkg-a",
    direction: "Promesse chiffrée",
    title: "Ma méthode pour des miniatures qui cliquent",
    thumbnailText: "10 MIN",
    visualIdea: "Visage surpris à gauche, chronomètre géant à droite.",
    titleRole: "Promet la méthode",
    thumbRole: "Montre la rapidité",
  },
  {
    id: "pkg-b",
    direction: "Avant / après",
    title: "J'ai refait toutes mes miniatures",
    thumbnailText: "AVANT/APRÈS",
    visualIdea: "Deux miniatures côte à côte, l'ancienne grisée.",
    titleRole: "Raconte l'expérience",
    thumbRole: "Prouve le résultat",
  },
  {
    id: "pkg-c",
    direction: "Erreur fréquente",
    title: "L'erreur qui tue tes clics",
    thumbnailText: "STOP",
    visualIdea: "Une miniature barrée d'une croix rouge.",
    titleRole: "Nomme le problème",
    thumbRole: "Montre le danger",
  },
];

const KEYS = ["A", "B", "C"] as const;
const PALETTE = { dominant: "#0F172A", accent: "#F59E0B", highlight: "#FFFFFF" };

function cardFor(index: number, withFace: boolean) {
  const cards = [
    {
      layout: "face-left_object-right",
      focal: "Le visage surpris",
      elements: [
        { what: "Visage surpris", role: "hero", sizePct: 45, position: "left" },
        { what: "Chronomètre géant", role: "support", sizePct: 30, position: "right" },
      ],
      textZone: { position: "top-right", heightPct: 20 },
      background: { kind: "solid", color: "#0F172A" },
    },
    {
      layout: "before-after",
      focal: "La nouvelle miniature",
      elements: [
        { what: "Nouvelle miniature", role: "hero", sizePct: 40, position: "right" },
        { what: "Ancienne miniature grisée", role: "support", sizePct: 35, position: "left" },
      ],
      textZone: { position: "top", heightPct: 18 },
      background: { kind: "gradient", color: "#1E293B" },
    },
    {
      layout: "object-hero_no-face",
      focal: "La croix rouge",
      elements: [{ what: "Miniature barrée d'une croix", role: "hero", sizePct: 55, position: "center" }],
      textZone: { position: "bottom", heightPct: 20 },
      background: { kind: "solid", color: "#111111" },
    },
  ];
  const card = { ...cards[index], palette: PALETTE };
  return withFace && index === 0 ? { ...card, emotion: { label: "surprise", intensity: 2, mouth: "closed" } } : card;
}

let counter = 0;

function systemText(options: LanguageModelV3CallOptions): string {
  return options.prompt
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n");
}

/** One model step: a short sentence, then one tool call whose id carries `key`. */
function step(sentence: string, toolName: string, input: unknown, key: string): LanguageModelV3StreamPart[] {
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

const ask = (key: string, input: Record<string, unknown>) => step("Question suivante.", "ask_user", { allow_skip: false, ...input }, `ask-${key}`);
const brief = (key: string, input: Record<string, unknown>) => step("J'écris la fiche.", "update_brief", input, `brief-${key}`);
const finish = (summary: string, nextActions: unknown[] = []) =>
  step("Je résume.", "finish_turn", { summary, results: [], next_actions: nextActions }, "finish");

type ToolResultPart = { type: "tool-result"; toolCallId: string; toolName: string; output: unknown };
type Answer = { selected?: string[]; other?: string; skipped?: boolean };

const keyOf = (toolCallId: string) => toolCallId.match(/^fake-(.+)-[a-z0-9]+$/)?.[1] ?? "";

function toolResults(options: LanguageModelV3CallOptions): ToolResultPart[] {
  return options.prompt.flatMap((message) =>
    message.role === "tool" ? (message.content as Array<{ type: string }>).filter((part): part is ToolResultPart => part.type === "tool-result") : [],
  );
}

function answerOf(results: ToolResultPart[], key: string): Answer | null {
  const result = [...results].reverse().find((candidate) => keyOf(candidate.toolCallId) === key);
  const value = (result?.output as { value?: unknown } | undefined)?.value;
  return value && typeof value === "object" ? (value as Answer) : null;
}

export function journeyScript(options: LanguageModelV3CallOptions, personas: FakePersona[]): LanguageModelV3StreamPart[] {
  const system = systemText(options);
  const results = toolResults(options);
  const last = options.prompt.at(-1);
  const interviewIds = () => [...new Set([...system.matchAll(/"id":\s*"(iv-[\w-]+)"/g)].map((match) => match[1]))];

  const askPromise = () =>
    ask("promise", { question: "De quoi parle la vidéo, et qu'est-ce que le spectateur saura faire ou comprendre à la fin ?", step: 1, options: [] });
  const packages = () =>
    (answerOf(results, "ask-packages")?.selected ?? []).flatMap((id) => PACKAGES.filter((pkg) => pkg.id === id)).slice(0, 3);
  const persona = () => {
    const selected = answerOf(results, "ask-persona")?.selected?.[0];
    return selected && selected !== "none" ? `stored:persona_${selected}` : "none";
  };
  const writePackage = (index: number) => {
    const kept = packages();
    if (kept.length === 0) return finish("Aucun package gardé : le parcours simulé s'arrête.");
    const { direction, title, thumbnailText, visualIdea, titleRole, thumbRole } = kept[index];
    return brief(`package-${index}`, {
      ...(index === kept.length - 1 ? { step: 5 } : {}),
      variant: { key: KEYS[index], set: { direction, title, thumbnailText, visualIdea, titleRole, thumbRole } },
    });
  };
  const writeCard = (index: number) =>
    brief(`card-${index}`, { variant: { key: KEYS[index], set: { composition: cardFor(index, persona() !== "none") } } });

  if (last?.role !== "tool") {
    // The per-turn brief block (the cached static prompt only names the opening tag).
    if (system.includes("</thumbnail_brief>")) return finish("On reprend là où la fiche s'est arrêtée.");
    if (interviewIds().length > 0) {
      return ask("resume", {
        question: "Une interview a déjà construit des nœuds sur ce canvas.",
        step: 1,
        options: [
          { id: "resume", label: "Reprendre l'interview" },
          { id: "restart", label: "Repartir de zéro" },
        ],
      });
    }
    return askPromise();
  }

  const result = (last.content as Array<{ type: string }>).find((part): part is ToolResultPart => part.type === "tool-result");
  if (!result) return finish("Parcours simulé interrompu.");
  if ((result.output as { type?: string } | null)?.type === "error-text") return finish("Désolé, cette étape n'a pas pu être enregistrée.");
  const key = keyOf(result.toolCallId);
  const answer = answerOf(results, key);
  if (answer?.skipped) return finish("Question passée : le parcours simulé s'arrête.");

  const cardMatch = key.match(/^(brief|ask)-card-(\d)$/);
  const packageMatch = key.match(/^brief-package-(\d)$/);
  if (packageMatch) {
    const index = Number(packageMatch[1]);
    if (index + 1 < packages().length) return writePackage(index + 1);
    return ask("persona", {
      question: "Quel personnage sur la miniature ?",
      step: 5,
      options: [
        ...personas.slice(0, 4).map((p) => ({ id: p.id, label: p.label.slice(0, 60), image: `stored:persona_${p.id}` })),
        { id: "none", label: "Aucun" },
      ],
    });
  }
  if (cardMatch) {
    const index = Number(cardMatch[2]);
    if (cardMatch[1] === "brief") {
      const pkg = packages()[index];
      return ask(`card-${index}`, {
        question: `Variante ${KEYS[index]} : ${pkg?.direction ?? "carte"}, ${cardFor(index, false).focal.toLowerCase()} — on valide la carte ?`,
        step: 6,
        options: [
          { id: "validate", label: "Valider" },
          { id: "background", label: "Changer le fond" },
        ],
      });
    }
    return index + 1 < packages().length ? writeCard(index + 1) : brief("step7", { step: 7 });
  }

  switch (key) {
    case "ask-resume":
      if (!answer?.selected?.includes("restart")) return askPromise();
      return step(
        "Je repars de zéro.",
        "apply_workflow",
        { project_id: system.match(/<project_id>([^<]+)<\/project_id>/)?.[1] ?? "", blueprint: { nodes: [], edges: [] }, remove_node_ids: interviewIds() },
        "restart",
      );
    case "restart":
      return askPromise();
    case "ask-promise":
      return brief("video", {
        step: 4,
        video: {
          subject: (answer?.other ?? "Une vidéo sur les miniatures YouTube").slice(0, 300),
          promise: "Savoir créer une miniature qui donne envie de cliquer",
          audience: "Créateurs YouTube débutants",
        },
      });
    case "brief-video":
      return ask("strategy", {
        question: "Quelle stratégie pour le test A/B ?",
        step: 4,
        options: [
          { id: "concepts", label: "Trouver le meilleur concept" },
          { id: "single-variable", label: "Optimiser un détail" },
        ],
      });
    case "ask-strategy":
      return brief(
        "strategy",
        answer?.selected?.[0] === "single-variable" ? { abStrategy: "single-variable", abVariable: "text" } : { abStrategy: "concepts" },
      );
    case "brief-strategy":
      return ask("packages", {
        question: "Quels packages garder ?",
        step: 4,
        multiple: true,
        max_selected: 3,
        options: PACKAGES.map((pkg) => ({ id: pkg.id, label: pkg.direction, description: `${pkg.title} | ${pkg.thumbnailText}` })),
      });
    case "ask-packages":
      return writePackage(0);
    case "ask-persona":
      return brief("common", {
        step: 6,
        common: { persona: persona(), style: "Aplats contrastés, contour épais", colors: ["#0F172A", "#F59E0B", "#FFFFFF"] },
      });
    case "brief-common":
      return writeCard(0);
    case "brief-step7": {
      const kept = packages();
      const promptOf = (pkg: (typeof PACKAGES)[number]) => `Miniature « ${pkg.direction} » : ${pkg.visualIdea} Texte "${pkg.thumbnailText}".`;
      if (kept.length === 1) {
        return step("Je pose le prompt.", "place_node", { node: { id: "iv-prompt", type: "prompt", data: { prompt: promptOf(kept[0]) } } }, "place-prompt");
      }
      const handles = ["prompt-in", "prompt-in-b", "prompt-in-c"];
      return step(
        "Je pose le test A/B.",
        "apply_workflow",
        {
          project_id: system.match(/<project_id>([^<]+)<\/project_id>/)?.[1] ?? "",
          blueprint: {
            nodes: [
              ...kept.map((pkg, index) => ({ id: `journey-prompt-${KEYS[index].toLowerCase()}`, type: "prompt", data: { prompt: promptOf(pkg) } })),
              {
                id: "journey-generator",
                type: "generator",
                data: { model: "nano-banana", aspectRatio: "16x9", count: 1, abTest: { variants: KEYS.slice(0, kept.length) } },
              },
            ],
            edges: kept.map((_, index) => ({ source: `journey-prompt-${KEYS[index].toLowerCase()}`, target: "journey-generator", targetHandle: handles[index] })),
          },
        },
        "workflow",
      );
    }
    case "place-prompt":
      return step(
        "Je pose le générateur.",
        "place_node",
        { node: { id: "iv-generator", type: "generator", data: { model: "nano-banana", aspectRatio: "16x9", count: 1 } } },
        "place-generator",
      );
    case "place-generator":
      return finish("Le workflow de ta miniature est prêt : le prompt et le générateur.", [{ kind: "generate", node_id: "iv-generator" }]);
    case "workflow":
      return finish("Le test A/B est sur le canvas : un prompt par variante et le générateur.", [{ kind: "generate", node_id: "journey-generator" }]);
    default:
      return finish("Parcours simulé terminé.");
  }
}
