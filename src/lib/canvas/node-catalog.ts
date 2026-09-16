import type { LucideIcon } from "lucide-react";
import {
  Eye,
  Hexagon,
  Image as ImageIcon,
  MessageSquareText,
  PenLine,
  Sparkles,
  Type,
  UserRound,
} from "lucide-react";

/**
 * Single source of truth for what the canvas UI can add (« Ajouter une
 * étape » panel, wire dropped on empty space, generator « + Ajouter »).
 *
 * Each entry maps to a React Flow node type (+ initial data) and declares its
 * handles, so the compatibility between a dragged wire and a new node is
 * computed here instead of being hard-coded in Canvas.tsx.
 *
 * `inputs[].accepts` lists catalogue ids, not node types: a `swipeFile` is
 * either a « reference » or a « logo », and they plug into different
 * generator handles.
 */
export type CatalogEntry = {
  id: string;
  category: "entrees" | "generation" | "finition";
  title: string;
  description: string;
  keywords: string[];
  icon: LucideIcon;
  nodeType: string;
  initialData?: Record<string, unknown>;
  inputs: { handle: string; accepts: string[] }[];
  output?: { handle: string };
};

export const CATALOG_CATEGORIES: { id: CatalogEntry["category"]; label: string }[] = [
  { id: "entrees", label: "Entrées" },
  { id: "generation", label: "Génération" },
  { id: "finition", label: "Finition" },
];

export const NODE_CATALOG: CatalogEntry[] = [
  {
    id: "prompt",
    category: "entrees",
    title: "Prompt",
    description: "Décris la miniature en texte.",
    keywords: ["texte", "description", "consigne", "idee", "text"],
    icon: MessageSquareText,
    nodeType: "prompt",
    inputs: [],
    output: { handle: "prompt" },
  },
  {
    id: "personnage",
    category: "entrees",
    title: "Personnage",
    description: "Ton visage sous plusieurs angles, depuis ta bibliothèque.",
    keywords: ["visage", "face", "persona", "moi", "portrait", "character"],
    icon: UserRound,
    nodeType: "faceReference",
    inputs: [],
    output: { handle: "face" },
  },
  {
    id: "reference",
    category: "entrees",
    title: "Image de référence",
    description: "Une image d'inspiration pour le style ou la composition.",
    keywords: ["inspiration", "photo", "style", "composition", "miniature", "reference"],
    icon: ImageIcon,
    nodeType: "swipeFile",
    initialData: { kind: "reference" },
    inputs: [],
    output: { handle: "image" },
  },
  {
    id: "logo",
    category: "entrees",
    title: "Logo",
    description: "Un logo à intégrer dans la miniature.",
    keywords: ["marque", "brand", "icone", "embleme"],
    icon: Hexagon,
    nodeType: "swipeFile",
    initialData: { kind: "logo" },
    inputs: [],
    output: { handle: "image" },
  },
  {
    id: "croquis",
    category: "entrees",
    title: "Croquis",
    description: "Dessine la composition à la main.",
    keywords: ["dessin", "sketch", "esquisse", "brouillon", "draw"],
    icon: PenLine,
    nodeType: "sketch",
    inputs: [],
    output: { handle: "image" },
  },
  {
    id: "generateur",
    category: "generation",
    title: "Générateur",
    description: "Génère la miniature à partir des entrées branchées.",
    keywords: ["generer", "generate", "ia", "ai", "modele", "model", "image"],
    icon: Sparkles,
    nodeType: "generator",
    inputs: [
      { handle: "prompt-in", accepts: ["prompt"] },
      { handle: "face-in", accepts: ["personnage"] },
      { handle: "ref-in", accepts: ["reference", "apercu", "texte"] },
      { handle: "logo-in", accepts: ["logo"] },
      { handle: "sketch-in", accepts: ["croquis"] },
    ],
    output: { handle: "result" },
  },
  {
    id: "texte",
    category: "finition",
    title: "Texte overlay",
    description: "Ajoute un texte par-dessus une image générée.",
    keywords: ["titre", "title", "text", "overlay", "accroche"],
    icon: Type,
    nodeType: "textOverlay",
    // A generator never holds an image on itself (its results land on new
    // Aperçu nodes) — only an Aperçu's output feeds Texte overlay.
    inputs: [{ handle: "image-in", accepts: ["apercu"] }],
    output: { handle: "result" },
  },
  {
    id: "apercu",
    category: "finition",
    title: "Aperçu",
    description: "Affiche et sélectionne un résultat.",
    keywords: ["preview", "resultat", "voir", "selection"],
    icon: Eye,
    nodeType: "preview",
    inputs: [{ handle: "preview-in", accepts: ["generateur", "texte"] }],
    output: { handle: "preview-out" },
  },
];

export const HANDLE_LABELS: Record<string, string> = {
  prompt: "Prompt",
  face: "Personnage",
  image: "Image",
  result: "Résultat",
  "preview-out": "Aperçu",
  "prompt-in": "Prompt",
  "face-in": "Personnage",
  "ref-in": "Image de référence",
  "logo-in": "Logo",
  "sketch-in": "Croquis",
  "image-in": "Image",
  "preview-in": "Aperçu",
};

export function handleLabel(handleId: string): string {
  return HANDLE_LABELS[handleId] ?? handleId;
}

/** Lower-case, accent-free, trimmed — « Aperçu » and « apercu » compare equal. */
export function normalizeSearchText(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/**
 * Case- and accent-insensitive filter over title, description and keywords.
 * Every word of the query must match somewhere. Keeps the order of `entries`.
 */
export function searchCatalog(query: string, entries: CatalogEntry[] = NODE_CATALOG): CatalogEntry[] {
  const words = normalizeSearchText(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...entries];
  return entries.filter((entry) => {
    const haystack = normalizeSearchText([entry.title, entry.description, ...entry.keywords].join(" "));
    return words.every((word) => haystack.includes(word));
  });
}

/**
 * Which catalogue entry an existing canvas node corresponds to. A swipeFile
 * is a logo when it says so (`kind`), or when it comes from the logo library
 * (older nodes were created without `kind`).
 */
export function catalogIdForNode(node: { type?: string; data?: Record<string, unknown> }): string | undefined {
  if (node.type === "swipeFile") {
    const data = node.data ?? {};
    const isLogo =
      data.kind === "logo" ||
      (typeof data.imageUrl === "string" && data.imageUrl.startsWith("/api/logos/")) ||
      (typeof data.image_source === "string" && data.image_source.startsWith("stored:lg_"));
    return isLogo ? "logo" : "reference";
  }
  return NODE_CATALOG.find((entry) => entry.nodeType === node.type)?.id;
}

/**
 * Entries that can be wired to the handle a wire was dragged from, with the
 * handle to use on the NEW node.
 * - from an output (`source`): entries with an input accepting that node;
 * - from an input (`target`): entries accepted by that input, via their output.
 * `data` is the dragged-from node's data (needed to tell a Logo from a
 * reference image); omitting it is allowed.
 */
export function compatibleEntries(from: {
  nodeType: string;
  handleId: string;
  handleType: "source" | "target";
  data?: Record<string, unknown>;
}): Array<{ entry: CatalogEntry; newNodeHandle: string }> {
  if (from.handleType === "source") {
    const sourceId = catalogIdForNode({ type: from.nodeType, data: from.data });
    const sourceEntry = NODE_CATALOG.find((entry) => entry.id === sourceId);
    if (!sourceEntry || sourceEntry.output?.handle !== from.handleId) return [];
    const matches: Array<{ entry: CatalogEntry; newNodeHandle: string }> = [];
    for (const entry of NODE_CATALOG) {
      const input = entry.inputs.find((candidate) => candidate.accepts.includes(sourceEntry.id));
      if (input) matches.push({ entry, newNodeHandle: input.handle });
    }
    return matches;
  }

  const targetEntry = NODE_CATALOG.find(
    (entry) => entry.nodeType === from.nodeType && entry.inputs.some((input) => input.handle === from.handleId),
  );
  const input = targetEntry?.inputs.find((candidate) => candidate.handle === from.handleId);
  if (!input) return [];
  const matches: Array<{ entry: CatalogEntry; newNodeHandle: string }> = [];
  for (const entry of NODE_CATALOG) {
    if (entry.output && input.accepts.includes(entry.id)) {
      matches.push({ entry, newNodeHandle: entry.output.handle });
    }
  }
  return matches;
}
