import { create } from "zustand";
import type { ImageResolution } from "@/lib/image-models";
import {
  Node,
  Edge,
  Connection,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  NodeChange,
  EdgeChange,
} from "@xyflow/react";
import { v4 as uuid } from "uuid";
import { migrateCanvas } from "@/lib/canvas/migrate-canvas";
import { compareUpdatedAt, laterUpdatedAt, type CanvasPatch, type CanvasWorkflowPatch } from "@/lib/canvas/canvas-patch";
import { abortAllGeneratorRuns } from "@/lib/canvas/generation-abort";
import { generatedImageIdFromUrl } from "@/lib/canvas/image-refs";
import { isWorkflowSketchSlotId } from "@/lib/canvas/chat-sketch";
import { keepLocalGenerationNodes, keepLocalNodePositions } from "@/lib/canvas/generation-state";
import { pollCanvasIsEcho, serverCanvasSkipReason, type LoadProjectOptions } from "@/lib/canvas/load-guard";
import { persistCanvasEqual, persistCanvasKey, persistGraphEqual, persistNodesForSave, PROJECT_SAVE_MAX_BYTES } from "@/lib/canvas/persist-snapshot";
import { PAYLOAD_TOO_LARGE_FR } from "@/lib/generation/generate-error";
import {
  asDeletedIds,
  exceptLiveIds,
  exceptLiveTombstones,
  filterTombstonedCanvas,
  mergeLocalOnlyCanvas,
  mergeTombstones,
  nextDeletedIds,
  unionDeletedIds,
} from "@/lib/canvas/tombstones";
import { debugLog } from "@/lib/debug-log";
import {
  edgesToRemoveForVariants,
  normalizeVariants,
  resolveVariantInputs,
  type AbTest,
  type ResolvedVariantInputs,
  type VariantId,
} from "@/lib/canvas/generator-variants";

export type NodeData = {
  label?: string;
  imageUrl?: string;
  imageBase64?: string;
  // swipeFile only: a logo plugs into the generator's logo-in, a reference
  // image into ref-in. Older nodes have no kind (see catalogIdForNode).
  kind?: "reference" | "logo";
  // Agent leftover on swipeFile / sketch: stored:gi_ / stored:sf_ / generated:…
  image_source?: string;
  // Personnage: a reusable multi-angle face reference (front/left/right),
  // captured via webcam or uploaded. Populated instead of imageUrl/imageBase64
  // when the faceReference node represents a full persona rather than a
  // single photo.
  personaId?: string;
  personaAngles?: { front?: string; left?: string; right?: string };
  prompt?: string;
  negativePrompt?: string;
  model?: string;
  aspectRatio?: string;
  imageSize?: ImageResolution; // output resolution; unset → the defaultResolution setting
  isGenerating?: boolean;
  generatedImages?: string[];
  selectedImageIndex?: number;
  numImages?: number; // Number of images to generate per model
  favoriteModel?: string; // User's favorite model for quick access
  sketchElements?: string; // JSON string of Excalidraw elements
  sketchFiles?: string; // JSON string of Excalidraw files
  // Text overlay node
  overlayText?: string;
  overlayColor?: string;
  overlayStrokeColor?: string;
  overlayPosition?: "top" | "center" | "bottom";
  overlayFontScale?: number;
  // Preview stats
  genStatus?: "loading" | "done" | "error";
  genError?: string;
  genTimeMs?: number;
  genPromptUsed?: string;
  genModel?: string;
  genTokens?: number;
  genCost?: string;
  genWarning?: string;
  // Générateur — test A/B/C. Absent or fewer than 2 variants = normal mode.
  abTest?: AbTest;
  // Images of the last generation per variant; generatedImages keeps variant A's.
  generatedImagesByVariant?: Partial<Record<VariantId, string[]>>;
};

export type AppNode = Node<NodeData>;

/**
 * « Ajouter une étape » panel. `free`: any step, placed at `flowPos` or at the
 * centre of the view. `connect`: only steps compatible with the handle the
 * wire comes from; the new node is wired to it and placed at `flowPos`, or
 * 320px left (target handle) / right (source handle) of that node.
 */
export type NodePickerState =
  | { mode: "free"; flowPos?: { x: number; y: number } }
  | {
      mode: "connect";
      flowPos?: { x: number; y: number };
      from: { nodeId: string; handleId: string; handleType: "source" | "target" };
    };

type Snapshot = { nodes: AppNode[]; edges: Edge[] };

interface CanvasState {
  nodes: AppNode[];
  edges: Edge[];
  loaded: boolean;
  // True while loadProject's request runs: agent patches applied meanwhile are
  // replayed over the loaded canvas when newer than it (chantier F2).
  loading: boolean;
  saving: boolean;
  // True from the moment a local edit happens until it's been persisted —
  // useCanvasSync's poll checks this before reloading from the server, so an
  // in-flight drag/delete/etc can't get clobbered by a reload of the
  // not-yet-saved server state (which visually looks like the edit "didn't
  // take" / snapped back).
  dirty: boolean;
  // The `updated_at` values the server returned from this app's own last few
  // successful saves (see saveProject; bounded to MAX_RECENT_SELF_SAVES).
  // useCanvasSync's poll checks an observed `updated_at` for membership here
  // to tell "my own autosave landed" apart from "another client changed the
  // project" — only the latter should trigger a reload (which resets the
  // undo history). A single latest-value isn't enough: a poll GET issued
  // before a second self-save can still be answered, after that save has
  // already landed and overwritten a single-value baseline, with the
  // *earlier* save's timestamp — which is still legitimately our own.
  recentOwnSaveUpdatedAts: string[];
  // The `updated_at` of the server canvas this store's state is based on
  // (chantier F2): set on load, on a successful save and when an agent patch
  // is applied. Sent as `baseUpdatedAt` with every save so the server keeps
  // agent nodes placed after it; a patch not newer than it is ignored.
  knownUpdatedAt: string | null;
  /** Increments on every local edit; an in-flight save whose epoch is behind must retry. */
  revision: number;
  /** Node ids the user deleted this session — stale saves/polls must not resurrect them. */
  deletedNodeIds: string[];
  /** Edge ids the user deleted this session. */
  deletedEdgeIds: string[];
  /** Last server `updated_at` that persisted this canvas (ISO). */
  lastSavedAt: string | null;
  /** Set when POST /api/project fails; cleared on the next successful save or edit. */
  saveError: string | null;
  currentProjectId: string;
  /** Gallery cover for this project (`/api/generated-images/image?id=`), or null. */
  coverImageUrl: string | null;
  history: Snapshot[];
  historyIndex: number;
  onNodesChange: (changes: NodeChange<AppNode>[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  addNode: (type: string, position: { x: number; y: number }, data?: NodeData) => string;
  addNodeAndConnect: (
    type: string,
    position: { x: number; y: number },
    connectTo: string,
    connectToHandle: string,
    newNodeHandle?: string,
    data?: NodeData,
    newNodeIsTarget?: boolean,
  ) => string;
  /**
   * Chat click-to-canvas: add THIS sketch as a new node (unique id). Never
   * reuses sketch-a/b/c. Clears a false tombstone for the new id.
   */
  placeChatSketch: (node: AppNode, edge?: Edge) => string;
  updateNodeData: (nodeId: string, data: Partial<NodeData>) => void;
  // A node the agent placed on the server (`data-canvas-patch`): created, or
  // its changed data fields merged, with its new edges, as one history entry.
  // The database already has it, so this neither marks the canvas dirty nor
  // saves. Accept patches with shouldApplyCanvasPatch first.
  applyAgentPatch: (patch: CanvasPatch) => void;
  // One apply_workflow write (`data-canvas-workflow-patch`): several nodes
  // share a single updatedAt, so they must land as one store update.
  applyAgentWorkflowPatch: (patch: CanvasWorkflowPatch) => void;
  // Clears infinite « Génération en cours… » spinners and aborts in-flight
  // fetches. Does not start a paid generation.
  cancelStuckGenerations: () => number;
  removeNode: (nodeId: string) => void;
  /** Keyboard ⌫/Delete: drop selected nodes and edges. Not used by React Flow remounts. */
  deleteSelected: () => void;
  duplicateNode: (nodeId: string) => string;
  setAllSelected: (selected: boolean) => void;
  selectOnly: (ids: string[]) => void;
  nodePicker: NodePickerState | null;
  openNodePicker: (state: NodePickerState) => void;
  closeNodePicker: () => void;
  getConnectedInputs: (nodeId: string) => {
    faceRefs: AppNode[];
    swipeRefs: AppNode[];
    prompts: AppNode[];
    logos: AppNode[];
    sketches: AppNode[];
    images: AppNode[];
  };
  // Inputs of one variant of a generator (common + per-variant, B/C inheriting A).
  getVariantInputs: (nodeId: string, variant: VariantId) => ResolvedVariantInputs<AppNode>;
  // Sets a generator's variants (["A"] = normal mode) and removes, in the same
  // history step, the edges plugged into handles of the variants dropped.
  setGeneratorVariants: (nodeId: string, variants: VariantId[]) => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  loadProject: (projectId?: string, options?: LoadProjectOptions) => Promise<void>;
  saveProject: (projectId?: string) => Promise<void>;
  /** Sets this project's gallery cover (one winner; replaces the previous). */
  setCoverImage: (url: string) => Promise<boolean>;
  // Saves a local edit still waiting on its debounced autosave right away and
  // cancels that autosave. Used before overwriting the canvas on the server
  // (« Historique de l'agent » restore), so a late autosave can't write the
  // pre-restore nodes back over the restored ones.
  flushPendingSave: () => Promise<void>;
  // Drops a scheduled autosave without saving (right before loadProject
  // replaces the canvas with the server's state).
  cancelPendingSave: () => void;
}

let saveTimeout: ReturnType<typeof setTimeout> | null = null;
// The save request currently running, if any (see flushPendingSave).
let inFlightSave: Promise<void> | null = null;
/** Bumped on every local edit so an in-flight save can tell it captured stale nodes. */
let mutationEpoch = 0;
/** A save was requested while another was running — retry when the current one lands. */
let saveQueued = false;
/** Persist key of the POST currently in flight — drop a queued save with the same graph. */
let inFlightPersistKey: string | null = null;
/** Persist key of the last POST we sent (or the last loaded server canvas). */
let lastSentPersistKey: string | null = null;
/** Ignore React Flow add/remove/reset immediately after applying a server snapshot. */
let ignoreFlowReconcile = 0;
/** Chat-placed sketch ids: React Flow remount `remove` must not tombstone them. */
const pinnedChatSketchIds = new Set<string>();

function debouncedSave(state: CanvasState, set: (s: Partial<CanvasState>) => void) {
  if (lastSentPersistKey === persistKeyOf(state) && !state.saveError) return;
  mutationEpoch += 1;
  set({ dirty: true, revision: mutationEpoch, saveError: null });
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    saveTimeout = null;
    state.saveProject();
  }, 2000);
}

const MAX_HISTORY = 50;

// How many of the app's own recent save timestamps useCanvasSync's poll
// remembers — see the recentOwnSaveUpdatedAts doc comment on CanvasState.
const MAX_RECENT_SELF_SAVES = 5;

let historyTimeout: ReturnType<typeof setTimeout> | null = null;

const edgeKey = (edge: { source: string; target: string; targetHandle?: string | null }) =>
  JSON.stringify([edge.source, edge.target, edge.targetHandle ?? ""]);

/** Agent writes applied while loadProject runs, replayed over the loaded canvas when newer than it. */
type AgentWriteDuringLoad = { kind: "node"; patch: CanvasPatch } | { kind: "workflow"; patch: CanvasWorkflowPatch };
let patchesDuringLoad: AgentWriteDuringLoad[] = [];

function queueWriteDuringLoad(write: AgentWriteDuringLoad) {
  patchesDuringLoad = [...patchesDuringLoad, write].slice(-MAX_PATCHES_DURING_LOAD);
}
/** The project loadProject is loading: only its patches are kept for the replay. */
let loadingProjectId: string | null = null;
/** A reload triggered by a patch that followed an unseen server write is running. */
let resyncing = false;
/** Bumped at each loadProject start; a slower GET must not apply after a newer one. */
let loadGeneration = 0;
/** One in-flight GET /api/project per project — remounts must not start a GET storm. */
const inFlightProjectLoads = new Map<string, Promise<void>>();
const MAX_PATCHES_DURING_LOAD = 30;

function withDeletions(
  prev: { nodes: AppNode[]; edges: Edge[]; deletedNodeIds: string[]; deletedEdgeIds: string[] },
  next: { nodes: AppNode[]; edges: Edge[] },
) {
  return {
    ...next,
    deletedNodeIds: nextDeletedIds(prev.nodes, next.nodes, prev.deletedNodeIds),
    deletedEdgeIds: nextDeletedIds(prev.edges, next.edges, prev.deletedEdgeIds),
  };
}

/** The canvas with one agent patch applied (nodes and edges). */
function withAgentPatch(state: Pick<CanvasState, "nodes" | "edges">, patch: CanvasPatch): { nodes: AppNode[]; edges: Edge[] } {
  const { node } = patch;
  const local = state.nodes.find((n) => n.id === node.id);
  let nodes = state.nodes;
  if (local) {
    const data: Record<string, unknown> = { ...local.data, ...node.data };
    for (const key of patch.removedDataKeys) if (!(key in node.data)) delete data[key];
    nodes = state.nodes.map((n) => (n.id === node.id ? { ...n, data: data as NodeData } : n));
  } else if (patch.created) {
    nodes = [...state.nodes, { id: node.id, type: node.type, position: node.position, data: node.data as NodeData }];
  }
  // An update of a node deleted here carries only its changed fields: nothing to rebuild it from
  // (the save that deleted it respects the deletion, or reinjects the whole node).
  const ids = new Set(nodes.map((n) => n.id));
  const edges = [
    ...state.edges,
    ...newEdges(state.edges, patch.edges).filter((edge) => ids.has(edge.source) && ids.has(edge.target)),
  ];
  return { nodes, edges };
}

/** `added` minus the edges already in `current` (same source, target and targetHandle), deduplicated. */
function newEdges(current: Edge[], added: Edge[]): Edge[] {
  const keys = new Set(current.map(edgeKey));
  return added.filter((edge) => {
    const key = edgeKey(edge);
    if (keys.has(key)) return false;
    keys.add(key);
    return true;
  });
}

function removedEdgeKey(edge: { source: string; target: string; targetHandle?: string | null }) {
  return edgeKey(edge);
}

function withAgentWorkflowPatch(
  state: Pick<CanvasState, "nodes" | "edges">,
  patch: CanvasWorkflowPatch,
): { nodes: AppNode[]; edges: Edge[] } {
  const removed = new Set(patch.removedIds);
  let nodes = state.nodes.filter((node) => !removed.has(node.id));
  const droppedEdgeKeys = new Set(patch.removedEdges.map(removedEdgeKey));
  let edges = state.edges.filter(
    (edge) => !removed.has(edge.source) && !removed.has(edge.target) && !droppedEdgeKeys.has(edgeKey(edge)),
  );
  for (const node of patch.created) {
    if (nodes.some((n) => n.id === node.id)) continue;
    nodes = [...nodes, { id: node.id, type: node.type, position: node.position, data: node.data as NodeData }];
  }
  for (const update of patch.updated) {
    const { node } = update;
    const local = nodes.find((n) => n.id === node.id);
    if (!local) continue;
    const data: Record<string, unknown> = { ...local.data, ...node.data };
    for (const key of update.removedDataKeys) if (!(key in node.data)) delete data[key];
    nodes = nodes.map((n) => (n.id === node.id ? { ...n, data: data as NodeData } : n));
  }
  const ids = new Set(nodes.map((n) => n.id));
  edges = [...edges, ...newEdges(edges, patch.edges as Edge[]).filter((edge) => ids.has(edge.source) && ids.has(edge.target))];
  return { nodes, edges };
}

function stripStuckGeneration(data: NodeData): { data: NodeData; changed: boolean } {
  let changed = false;
  const next: NodeData = { ...data };
  if (next.isGenerating) {
    delete next.isGenerating;
    changed = true;
  }
  if (next.genStatus === "loading") {
    next.genStatus = "error";
    next.genError = next.genError || "Génération interrompue";
    changed = true;
  }
  return { data: next, changed };
}

function clearStuckGenerationNodes(nodes: AppNode[]): { nodes: AppNode[]; cleared: number } {
  let cleared = 0;
  const next = nodes.map((node) => {
    const stripped = stripStuckGeneration(node.data);
    if (!stripped.changed) return node;
    cleared += 1;
    return { ...node, data: stripped.data };
  });
  return { nodes: next, cleared };
}

function appendHistorySnapshot(get: () => CanvasState, set: (s: Partial<CanvasState>) => void) {
  const { nodes, edges, history, historyIndex } = get();
  const newSnapshot: Snapshot = {
    nodes: JSON.parse(JSON.stringify(nodes)),
    edges: JSON.parse(JSON.stringify(edges)),
  };
  // Discard any forward history after current index
  const newHistory = [...history.slice(0, historyIndex + 1), newSnapshot].slice(-MAX_HISTORY);
  set({ history: newHistory, historyIndex: newHistory.length - 1 });
}

function pushHistory(get: () => CanvasState, set: (s: Partial<CanvasState>) => void) {
  // Debounce history snapshots so rapid changes (e.g. dragging) collapse into one
  if (historyTimeout) clearTimeout(historyTimeout);
  historyTimeout = setTimeout(() => {
    historyTimeout = null;
    appendHistorySnapshot(get, set);
  }, 300);
}

/** Records a pending debounced edit now, so the next change gets an undo step of its own. */
function flushPendingHistory(get: () => CanvasState, set: (s: Partial<CanvasState>) => void) {
  if (!historyTimeout) return;
  clearTimeout(historyTimeout);
  historyTimeout = null;
  appendHistorySnapshot(get, set);
}

/**
 * A patch followed a server write this canvas never saw (its previousUpdatedAt
 * is unknown here): save any local edit, then reload the canvas from the
 * database. One at a time.
 */
async function resyncAfterUnseenWrite(get: () => CanvasState, projectId: string) {
  if (resyncing) return;
  resyncing = true;
  try {
    await get().flushPendingSave();
    if (get().currentProjectId === projectId) await get().loadProject(projectId, { reason: "resync" });
  } finally {
    resyncing = false;
  }
}

/**
 * React Flow reports selection and measured sizes on its own, e.g. right
 * after an undo remounts the nodes. They are view state: recording them would
 * push a duplicate snapshot and wipe the redo stack. A resize by the user
 * (dimensions with `resizing`) is a real edit.
 */
function isViewOnlyNodeChange(change: NodeChange<AppNode>, nodes: AppNode[]): boolean {
  if (change.type === "select") return true;
  if (change.type === "dimensions" && !change.resizing) return true;
  if (change.type === "position") {
    const local = nodes.find((node) => node.id === change.id);
    if (!local || !change.position) return true;
    return local.position.x === change.position.x && local.position.y === change.position.y;
  }
  return false;
}

function flowChangeType(change: { type: string }): string {
  return change.type;
}

function isStructuralFlowChange(change: { type: string }): boolean {
  const type = flowChangeType(change);
  return type === "reset" || type === "replace" || type === "add" || type === "remove";
}

function armFlowReconcileGuard() {
  ignoreFlowReconcile += 1;
  const id = ignoreFlowReconcile;
  queueMicrotask(() => {
    setTimeout(() => {
      if (ignoreFlowReconcile === id) ignoreFlowReconcile = 0;
    }, 0);
  });
}

function persistKeyOf(state: {
  nodes: AppNode[];
  edges: Edge[];
  deletedNodeIds: string[];
  deletedEdgeIds: string[];
}): string {
  return persistCanvasKey(state);
}

export function resetPinnedChatSketchesForTests() {
  pinnedChatSketchIds.clear();
  ignoreFlowReconcile = 0;
  lastSentPersistKey = null;
  inFlightPersistKey = null;
  saveQueued = false;
  mutationEpoch = 0;
  inFlightProjectLoads.clear();
  if (saveTimeout) {
    clearTimeout(saveTimeout);
    saveTimeout = null;
  }
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  nodes: [],
  edges: [],
  loaded: false,
  loading: false,
  saving: false,
  dirty: false,
  recentOwnSaveUpdatedAts: [],
  knownUpdatedAt: null,
  revision: 0,
  deletedNodeIds: [],
  deletedEdgeIds: [],
  lastSavedAt: null,
  saveError: null,
  currentProjectId: "default",
  coverImageUrl: null,
  history: [],
  historyIndex: -1,
  nodePicker: null,

  onNodesChange: (changes) => {
    const prev = get();
    const pinnedRemount = changes.some(
      (change) => change.type === "remove" && pinnedChatSketchIds.has(change.id) && !prev.nodes.find((n) => n.id === change.id)?.selected,
    );
    if (pinnedRemount) return;
    // React Flow remounts emit `remove` (even for a selected prompt the user
    // is editing). Real deletes go through removeNode / deleteSelected.
    const applied = changes.filter((change) => change.type !== "remove");
    if (applied.length === 0) return;
    const appliedNodes = applyNodeChanges(applied, prev.nodes);
    const appliedIds = new Set(appliedNodes.map((node) => node.id));
    const restored = prev.nodes.filter((node) => !appliedIds.has(node.id));
    const nodes = restored.length > 0 ? [...appliedNodes, ...restored] : appliedNodes;
    const viewOnly = applied.every((change) => isViewOnlyNodeChange(change, prev.nodes));
    if (viewOnly) {
      set({ nodes, edges: prev.edges });
      return;
    }
    const structuralOnly = applied.every(
      (change) => isStructuralFlowChange(change) || isViewOnlyNodeChange(change, prev.nodes),
    );
    const next = withDeletions(prev, { nodes, edges: prev.edges });
    const userResize = applied.some((change) => change.type === "dimensions" && change.resizing);
    if (!userResize && persistCanvasEqual(prev, next)) {
      set({ nodes, edges: prev.edges });
      return;
    }
    if (ignoreFlowReconcile && structuralOnly) return;
    ignoreFlowReconcile = 0;
    set(next);
    if (get().loaded) {
      pushHistory(get, set);
      debouncedSave(get(), set);
    }
  },

  onEdgesChange: (changes) => {
    const prev = get();
    // Same remount hole as nodes: React Flow `remove` is not a user delete.
    const applied = changes.filter((change) => change.type !== "remove");
    if (applied.length === 0) return;
    const appliedEdges = applyEdgeChanges(applied, prev.edges);
    const appliedIds = new Set(appliedEdges.map((edge) => edge.id));
    const restored = prev.edges.filter((edge) => !appliedIds.has(edge.id));
    const edges = restored.length > 0 ? [...appliedEdges, ...restored] : appliedEdges;
    const viewOnly = applied.every((change) => change.type === "select");
    if (viewOnly) {
      set({ nodes: prev.nodes, edges });
      return;
    }
    const structuralOnly = applied.every((change) => change.type === "select" || isStructuralFlowChange(change));
    const next = withDeletions(prev, { nodes: prev.nodes, edges });
    if (persistCanvasEqual(prev, next)) {
      set({ nodes: prev.nodes, edges });
      return;
    }
    if (ignoreFlowReconcile && structuralOnly) return;
    ignoreFlowReconcile = 0;
    set(next);
    if (get().loaded) {
      pushHistory(get, set);
      debouncedSave(get(), set);
    }
  },

  onConnect: (connection) => {
    const prev = get();
    set(withDeletions(prev, { nodes: prev.nodes, edges: addEdge({ ...connection, type: "custom" }, prev.edges) }));
    if (get().loaded) {
      pushHistory(get, set);
      debouncedSave(get(), set);
    }
  },

  addNode: (type, position, data = {}) => {
    const id = uuid();
    const newNode: AppNode = { id, type, position, data: { ...data } };
    const prev = get();
    set(withDeletions(prev, { nodes: [...prev.nodes, newNode], edges: prev.edges }));
    if (get().loaded) {
      pushHistory(get, set);
      debouncedSave(get(), set);
    }
    return id;
  },

  addNodeAndConnect: (type, position, connectTo, connectToHandle, newNodeHandle, data = {}, newNodeIsTarget = false) => {
    const id = uuid();
    const newNode: AppNode = { id, type, position, data: { ...data } };
    const newEdge: Edge = newNodeIsTarget
      ? {
          id: uuid(),
          source: connectTo,
          sourceHandle: connectToHandle || null,
          target: id,
          targetHandle: newNodeHandle || null,
          type: "custom",
        }
      : {
          id: uuid(),
          source: id,
          sourceHandle: newNodeHandle || null,
          target: connectTo,
          targetHandle: connectToHandle || null,
          type: "custom",
        };
    const prev = get();
    set(withDeletions(prev, { nodes: [...prev.nodes, newNode], edges: [...prev.edges, newEdge] }));
    if (get().loaded) {
      pushHistory(get, set);
      debouncedSave(get(), set);
    }
    return id;
  },

  placeChatSketch: (incoming, edge) => {
    let node: AppNode = {
      id: incoming.id,
      type: "sketch",
      position: incoming.position,
      data: { ...incoming.data },
    };
    let nextEdge = edge
      ? {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          sourceHandle: edge.sourceHandle ?? null,
          targetHandle: edge.targetHandle ?? null,
          type: edge.type ?? "custom",
        }
      : undefined;
    if (isWorkflowSketchSlotId(node.id) || get().nodes.some((existing) => existing.id === node.id && existing.type !== "sketch")) {
      node = { ...node, id: `sketch-${uuid().slice(0, 8)}` };
      if (nextEdge) nextEdge = { ...nextEdge, source: node.id };
    }
    pinnedChatSketchIds.add(node.id);
    const prev = get();
    const already = prev.nodes.find((existing) => existing.id === node.id);
    if (already) {
      set({
        nodes: prev.nodes.map((existing) =>
          existing.id === node.id ? { ...existing, data: { ...existing.data, ...node.data } } : existing,
        ),
        deletedNodeIds: prev.deletedNodeIds.filter((id) => id !== node.id),
      });
      if (get().loaded) {
        pushHistory(get, set);
        debouncedSave(get(), set);
      }
      return node.id;
    }
    armFlowReconcileGuard();
    const hasEdge =
      nextEdge &&
      prev.edges.some(
        (existing) =>
          existing.id === nextEdge.id ||
          (existing.source === nextEdge.source &&
            existing.target === nextEdge.target &&
            (existing.targetHandle ?? "") === (nextEdge.targetHandle ?? "")),
      );
    const edges = nextEdge && !hasEdge ? [...prev.edges, nextEdge] : prev.edges;
    set(withDeletions(prev, { nodes: [...prev.nodes, node], edges }));
    if (get().loaded) {
      pushHistory(get, set);
      debouncedSave(get(), set);
    }
    return node.id;
  },

  updateNodeData: (nodeId, data) => {
    const prev = get();
    const nodes = prev.nodes.map((node) =>
      node.id === nodeId ? { ...node, data: { ...node.data, ...data } } : node,
    );
    const persistEqual = persistGraphEqual({ nodes: prev.nodes, edges: prev.edges }, { nodes, edges: prev.edges });
    set({ nodes });
    if (get().loaded && !persistEqual) {
      pushHistory(get, set);
      debouncedSave(get(), set);
    }
  },

  applyAgentPatch: (patch) => {
    const state = get();
    // While a load runs, the canvas is about to be replaced: keep the patch for
    // the replay, only when it belongs to the project being loaded.
    if (state.loading) {
      if (patch.projectId === loadingProjectId) {
        queueWriteDuringLoad({ kind: "node", patch });
      }
      return;
    }
    if (!state.loaded || patch.projectId !== state.currentProjectId) return;
    // In sequence: this canvas knows the state the agent wrote over. Otherwise
    // another write happened in between (e.g. « Repartir de zéro »): show the
    // node, keep the older base (saves stay safe) and reload.
    const inSequence =
      state.knownUpdatedAt !== null && compareUpdatedAt(state.knownUpdatedAt, patch.previousUpdatedAt) >= 0;
    // One undo step of its own: a pending user edit is recorded first.
    flushPendingHistory(get, set);
    // The poller recognizes this state through knownUpdatedAt (not the own-save list).
    const afterPatch = get();
    set({
      ...withDeletions(afterPatch, withAgentPatch(afterPatch, patch)),
      ...(inSequence ? { knownUpdatedAt: laterUpdatedAt(state.knownUpdatedAt, patch.updatedAt) } : {}),
    });
    appendHistorySnapshot(get, set);
    debugLog("agent", "applyAgentPatch", {
      nodeId: patch.node.id,
      created: patch.created,
      inSequence,
      updatedAt: patch.updatedAt,
    });
    if (!inSequence) void resyncAfterUnseenWrite(get, patch.projectId);
  },

  applyAgentWorkflowPatch: (patch) => {
    const state = get();
    if (state.loading) {
      if (patch.projectId === loadingProjectId) {
        queueWriteDuringLoad({ kind: "workflow", patch });
      }
      return;
    }
    if (!state.loaded || patch.projectId !== state.currentProjectId) return;
    const inSequence =
      state.knownUpdatedAt !== null && compareUpdatedAt(state.knownUpdatedAt, patch.previousUpdatedAt) >= 0;
    flushPendingHistory(get, set);
    const afterWorkflow = get();
    set({
      ...withDeletions(afterWorkflow, withAgentWorkflowPatch(afterWorkflow, patch)),
      ...(inSequence ? { knownUpdatedAt: laterUpdatedAt(state.knownUpdatedAt, patch.updatedAt) } : {}),
    });
    appendHistorySnapshot(get, set);
    debugLog("agent", "applyAgentWorkflowPatch", {
      created: patch.created.map((node) => node.id),
      updated: patch.updated.map((item) => item.node.id),
      removed: patch.removedIds,
      addedEdges: patch.edges.length,
      inSequence,
      updatedAt: patch.updatedAt,
    });
    if (!inSequence) void resyncAfterUnseenWrite(get, patch.projectId);
  },

  cancelStuckGenerations: () => {
    abortAllGeneratorRuns();
    const { nodes, loaded } = get();
    const { nodes: next, cleared } = clearStuckGenerationNodes(nodes);
    if (cleared === 0) {
      debugLog("generate", "cancelStuckGenerations none");
      return 0;
    }
    set({ nodes: next });
    debugLog("generate", "cancelStuckGenerations", { cleared, persist: loaded });
    if (loaded) {
      pushHistory(get, set);
      debouncedSave(get(), set);
    }
    return cleared;
  },

  removeNode: (nodeId) => {
    pinnedChatSketchIds.delete(nodeId);
    const prev = get();
    set(
      withDeletions(prev, {
        nodes: prev.nodes.filter((n) => n.id !== nodeId),
        edges: prev.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
      }),
    );
    if (get().loaded) {
      pushHistory(get, set);
      debouncedSave(get(), set);
    }
  },

  deleteSelected: () => {
    const prev = get();
    const dropNodes = new Set(prev.nodes.filter((node) => node.selected).map((node) => node.id));
    const dropEdges = new Set(
      prev.edges
        .filter((edge) => edge.selected || dropNodes.has(edge.source) || dropNodes.has(edge.target))
        .map((edge) => edge.id),
    );
    if (dropNodes.size === 0 && dropEdges.size === 0) return;
    for (const id of dropNodes) pinnedChatSketchIds.delete(id);
    set(
      withDeletions(prev, {
        nodes: prev.nodes.filter((node) => !dropNodes.has(node.id)),
        edges: prev.edges.filter((edge) => !dropEdges.has(edge.id)),
      }),
    );
    if (get().loaded) {
      pushHistory(get, set);
      debouncedSave(get(), set);
    }
  },

  duplicateNode: (nodeId) => {
    const source = get().nodes.find((n) => n.id === nodeId);
    if (!source) return "";
    const id = uuid();
    const data = JSON.parse(JSON.stringify(source.data)) as NodeData;
    delete data.isGenerating;
    // "loading" only ever clears via the in-flight generation call that
    // targeted the original node's id — a copy stuck at "loading" would spin
    // forever with nothing left to update it.
    if (data.genStatus === "loading") delete data.genStatus;
    // The copy is the user's node, not the agent's: no interview bookkeeping
    // (a stale save must never treat it as an agent node, place_node never links it).
    const agentFields = data as Record<string, unknown>;
    delete agentFields.placedByAgentAt;
    delete agentFields.agentCreatedAt;
    delete agentFields.agentLinks;
    const copy: AppNode = {
      id,
      type: source.type,
      position: { x: source.position.x + 40, y: source.position.y + 40 },
      data,
    };
    const prev = get();
    set(withDeletions(prev, { nodes: [...prev.nodes, copy], edges: prev.edges }));
    if (get().loaded) {
      pushHistory(get, set);
      debouncedSave(get(), set);
    }
    return id;
  },

  // Selection is view state: no history entry, no save.
  setAllSelected: (selected) => {
    set({
      nodes: get().nodes.map((n) => (Boolean(n.selected) === selected ? n : { ...n, selected })),
      edges: selected ? get().edges : get().edges.map((e) => (e.selected ? { ...e, selected: false } : e)),
    });
  },

  // Selects exactly the given node ids (e.g. the copies from a ⌘D) and
  // deselects everything else, nodes and edges alike. View state: no
  // history entry, no save.
  selectOnly: (ids) => {
    const idSet = new Set(ids);
    set({
      nodes: get().nodes.map((n) => {
        const shouldSelect = idSet.has(n.id);
        return Boolean(n.selected) === shouldSelect ? n : { ...n, selected: shouldSelect };
      }),
      edges: get().edges.map((e) => (e.selected ? { ...e, selected: false } : e)),
    });
  },

  openNodePicker: (nodePicker) => set({ nodePicker }),
  closeNodePicker: () => set({ nodePicker: null }),

  getConnectedInputs: (nodeId) => {
    const { nodes, edges } = get();
    const incomingEdges = edges.filter((e) => e.target === nodeId);

    // Track handles
    const logoSourceIds = new Set(
      incomingEdges.filter((e) => e.targetHandle === "logo-in").map((e) => e.source)
    );
    const sketchSourceIds = new Set(
      incomingEdges.filter((e) => e.targetHandle === "sketch-in").map((e) => e.source)
    );

    const sourceIds = incomingEdges.map((e) => e.source);
    const sourceNodes = nodes.filter((n) => sourceIds.includes(n.id));

    return {
      faceRefs: sourceNodes.filter((n) => n.type === "faceReference"),
      swipeRefs: sourceNodes.filter((n) => (n.type === "swipeFile") && !logoSourceIds.has(n.id) && !sketchSourceIds.has(n.id)),
      prompts: sourceNodes.filter((n) => n.type === "prompt"),
      logos: sourceNodes.filter((n) => logoSourceIds.has(n.id)),
      sketches: sourceNodes.filter((n) => sketchSourceIds.has(n.id) || n.type === "sketch"),
      images: sourceNodes.filter(
        (n) => n.type === "preview" || n.type === "swipeFile" || n.type === "faceReference" || n.type === "textOverlay"
      ),
    };
  },

  getVariantInputs: (nodeId, variant) => {
    const { nodes, edges } = get();
    return resolveVariantInputs(edges, nodes, nodeId, variant);
  },

  setGeneratorVariants: (nodeId, variants) => {
    const kept = normalizeVariants(variants);
    const { nodes, edges } = get();
    const dropped = new Set(edgesToRemoveForVariants(edges, nodeId, kept));
    const abTest: AbTest | undefined = kept.length >= 2 ? { variants: kept } : undefined;
    const prev = get();
    set(
      withDeletions(prev, {
        edges: edges.filter((edge) => !dropped.has(edge)),
        nodes: nodes.map((node) => (node.id === nodeId ? { ...node, data: { ...node.data, abTest } } : node)),
      }),
    );
    if (get().loaded) {
      pushHistory(get, set);
      debouncedSave(get(), set);
    }
  },

  undo: () => {
    const prev = get();
    const { history, historyIndex } = prev;
    if (historyIndex <= 0) return;
    const newIndex = historyIndex - 1;
    const snapshot = history[newIndex];
    set({
      ...withDeletions(prev, {
        nodes: JSON.parse(JSON.stringify(snapshot.nodes)),
        edges: JSON.parse(JSON.stringify(snapshot.edges)),
      }),
      historyIndex: newIndex,
    });
    debouncedSave(get(), set);
  },

  redo: () => {
    const prev = get();
    const { history, historyIndex } = prev;
    if (historyIndex >= history.length - 1) return;
    const newIndex = historyIndex + 1;
    const snapshot = history[newIndex];
    set({
      ...withDeletions(prev, {
        nodes: JSON.parse(JSON.stringify(snapshot.nodes)),
        edges: JSON.parse(JSON.stringify(snapshot.edges)),
      }),
      historyIndex: newIndex,
    });
    debouncedSave(get(), set);
  },

  canUndo: () => get().historyIndex > 0,
  canRedo: () => get().historyIndex < get().history.length - 1,

  loadProject: async (projectId = "default", options?: LoadProjectOptions) => {
    const reason = options?.reason ?? "replace";
    const force = options?.force === true;
    const start = get();
    const switching = start.loaded && start.currentProjectId !== projectId;
    if (
      reason === "replace" &&
      !force &&
      !switching &&
      start.loaded &&
      start.currentProjectId === projectId &&
      !start.dirty
    ) {
      debugLog("canvas-load", "skip already loaded", { projectId });
      return;
    }
    if (
      reason === "poll" &&
      !force &&
      start.currentProjectId === projectId &&
      (start.dirty || start.saving || start.loading)
    ) {
      debugLog("canvas-load", "skip in-flight", {
        projectId,
        dirty: start.dirty,
        saving: start.saving,
        loading: start.loading,
      });
      return;
    }
    if (!force && !switching) {
      const pending = inFlightProjectLoads.get(projectId);
      if (pending) {
        debugLog("canvas-load", "join in-flight", { projectId, reason });
        await pending;
        return;
      }
    }

    let resolveInflight: () => void = () => {};
    if (!force && !switching) {
      inFlightProjectLoads.set(
        projectId,
        new Promise<void>((resolve) => {
          resolveInflight = resolve;
        }),
      );
    }

    const epochAtStart = mutationEpoch;
    const loadId = ++loadGeneration;
    if (switching || force) get().cancelPendingSave();

    patchesDuringLoad = [];
    loadingProjectId = projectId;
    set({ loading: true });
    debugLog("canvas-load", "start", { projectId, reason, force, epoch: epochAtStart });
    const replayQueued = (loadedUpdatedAt: string | null) => {
      const replay = patchesDuringLoad.filter((write) => {
        const patch = write.kind === "node" ? write.patch : write.patch;
        return patch.projectId === projectId && (loadedUpdatedAt === null || compareUpdatedAt(patch.updatedAt, loadedUpdatedAt) > 0);
      });
      patchesDuringLoad = [];
      for (const write of replay) {
        if (write.kind === "node") get().applyAgentPatch(write.patch);
        else get().applyAgentWorkflowPatch(write.patch);
      }
      return replay.length;
    };
    try {
      const res = await fetch(`/api/project?id=${projectId}`, { cache: "no-store" });
      if (loadId !== loadGeneration) {
        debugLog("canvas-load", "superseded", { projectId, loadId });
        return;
      }
      if (!res.ok) {
        console.warn("[canvas-load] non-OK status, using fallback", { projectId, status: res.status });
        debugLog("canvas-load", "HTTP error", { projectId, status: res.status }, "error");
        patchesDuringLoad = [];
        if (switching || force || !start.loaded) {
          set({ loaded: true, loading: false, currentProjectId: projectId, knownUpdatedAt: null, coverImageUrl: null, deletedNodeIds: [], deletedEdgeIds: [], history: [{ nodes: [], edges: [] }], historyIndex: 0 });
        } else {
          set({ loading: false });
        }
        return;
      }
      const data = await res.json();
      if (loadId !== loadGeneration) {
        debugLog("canvas-load", "superseded", { projectId, loadId });
        return;
      }
      const current = get();
      const serverTombs = {
        nodeIds: asDeletedIds(data.deletedNodeIds),
        edgeIds: asDeletedIds(data.deletedEdgeIds),
      };
      const liveServer = filterTombstonedCanvas((data.nodes || []) as AppNode[], (data.edges || []) as Edge[], serverTombs);
      const serverNodes = liveServer.nodes;
      const loadedUpdatedAt = typeof data.updatedAt === "string" ? data.updatedAt : null;
      const keepLocalTombs = current.loaded && current.currentProjectId === projectId && !force;
      const compareTombs = exceptLiveTombstones(
        keepLocalTombs
          ? mergeTombstones(serverTombs, { nodeIds: current.deletedNodeIds, edgeIds: current.deletedEdgeIds })
          : serverTombs,
        current.nodes,
        current.edges,
      );
      const liveWithLocalTombs = filterTombstonedCanvas(
        (data.nodes || []) as AppNode[],
        (data.edges || []) as Edge[],
        compareTombs,
      );
      const samePersistCanvas =
        persistGraphEqual(
          { nodes: current.nodes, edges: current.edges },
          { nodes: liveWithLocalTombs.nodes, edges: liveWithLocalTombs.edges },
        ) ||
        (reason === "poll" &&
          !force &&
          pollCanvasIsEcho({
            localNodes: current.nodes,
            localEdges: current.edges,
            serverNodes: (data.nodes || []) as AppNode[],
            serverEdges: (data.edges || []) as Edge[],
            tombstones: compareTombs,
          }));
      const skip = serverCanvasSkipReason({
        reason,
        force,
        sameProject: current.loaded && current.currentProjectId === projectId,
        loaded: current.loaded,
        dirty: current.dirty,
        saving: current.saving,
        localNodeCount: current.nodes.length,
        serverNodeCount: serverNodes.length,
        serverUpdatedAt: loadedUpdatedAt,
        knownUpdatedAt: current.knownUpdatedAt,
        epochAtStart,
        revision: mutationEpoch,
        samePersistCanvas,
      });
      if (skip) {
        const tombs = compareTombs;
        debugLog("canvas-load", skip === "same" ? "skip unchanged" : "keep local", {
          projectId,
          skip,
          local: current.nodes.length,
          server: serverNodes.length,
          updatedAt: loadedUpdatedAt,
          deletedNodeIds: tombs.nodeIds,
        });
        set({
          loading: false,
          ...(skip === "same"
            ? {
                dirty: false,
                knownUpdatedAt: laterUpdatedAt(current.knownUpdatedAt, loadedUpdatedAt),
                lastSavedAt: loadedUpdatedAt ?? current.lastSavedAt,
                deletedNodeIds: tombs.nodeIds,
                deletedEdgeIds: tombs.edgeIds,
              }
            : {
                deletedNodeIds: tombs.nodeIds,
                deletedEdgeIds: tombs.edgeIds,
                ...(skip === "more-nodes"
                  ? { knownUpdatedAt: laterUpdatedAt(current.knownUpdatedAt, loadedUpdatedAt) }
                  : {}),
              }),
        });
        if (skip === "same") lastSentPersistKey = persistKeyOf({ ...get(), deletedNodeIds: tombs.nodeIds, deletedEdgeIds: tombs.edgeIds });
        replayQueued(loadedUpdatedAt);
        if (skip === "more-nodes" && !current.dirty && !current.saving) {
          set({ dirty: true });
          void get().saveProject();
        }
        return;
      }

      // Lazy migrations (legacy "image-in" handle, single-photo face nodes →
      // reference images) — see migrateCanvas. When anything changed, the
      // normal debounced autosave persists the converted canvas.
      const migrated = migrateCanvas(liveServer.nodes, liveServer.edges);
      const stuck = clearStuckGenerationNodes(migrated.nodes);
      const keepTombstones = current.loaded && current.currentProjectId === projectId && !force && !switching;
      const mergedTombs = keepTombstones
        ? mergeTombstones(serverTombs, { nodeIds: current.deletedNodeIds, edgeIds: current.deletedEdgeIds })
        : serverTombs;
      const tombstones = keepTombstones
        ? exceptLiveTombstones(mergedTombs, current.nodes, current.edges)
        : mergedTombs;
      const merged =
        force || switching
          ? filterTombstonedCanvas(stuck.nodes, migrated.edges, tombstones)
          : mergeLocalOnlyCanvas(stuck.nodes, migrated.edges, current.nodes, current.edges, tombstones);
      const mergedNodes = (() => {
        const keptGen = reason === "poll" && !force ? keepLocalGenerationNodes(merged.nodes, current.nodes) : merged.nodes;
        return reason === "poll" && !force ? keepLocalNodePositions(keptGen, current.nodes) : keptGen;
      })();
      const persistRicher =
        reason === "poll" &&
        !force &&
        !persistGraphEqual({ nodes: merged.nodes, edges: merged.edges }, { nodes: mergedNodes, edges: merged.edges });
      const mergedExtras = mergedNodes.length > stuck.nodes.length || merged.edges.length > migrated.edges.length;
      const knownNodeTombs = new Set(current.deletedNodeIds);
      const knownEdgeTombs = new Set(current.deletedEdgeIds);
      const strippedDeleted =
        keepTombstones &&
        (stuck.nodes.some((node) => tombstones.nodeIds.includes(node.id) && !knownNodeTombs.has(node.id)) ||
          migrated.edges.some(
            (edge) =>
              (tombstones.edgeIds.includes(edge.id) && !knownEdgeTombs.has(edge.id)) ||
              (tombstones.nodeIds.includes(edge.source) && !knownNodeTombs.has(edge.source)) ||
              (tombstones.nodeIds.includes(edge.target) && !knownNodeTombs.has(edge.target)),
          ));
      const initialSnapshot: Snapshot = {
        nodes: JSON.parse(JSON.stringify(mergedNodes)),
        edges: JSON.parse(JSON.stringify(merged.edges)),
      };
      const coverImageUrl = typeof data.coverImageUrl === "string" && data.coverImageUrl ? data.coverImageUrl : null;
      const shouldDirty = mergedExtras || strippedDeleted || persistRicher;
      if (shouldDirty) mutationEpoch += 1;
      armFlowReconcileGuard();
      set({
        nodes: mergedNodes,
        edges: merged.edges,
        loaded: true,
        loading: false,
        currentProjectId: projectId,
        knownUpdatedAt: loadedUpdatedAt,
        coverImageUrl,
        lastSavedAt: loadedUpdatedAt,
        saveError: null,
        revision: mutationEpoch,
        deletedNodeIds: tombstones.nodeIds,
        deletedEdgeIds: tombstones.edgeIds,
        dirty: shouldDirty,
        history: [initialSnapshot],
        historyIndex: 0,
      });
      const followUpSave =
        mergedExtras || strippedDeleted || persistRicher || (reason !== "poll" && (migrated.changed || stuck.cleared > 0));
      if (!followUpSave) lastSentPersistKey = persistKeyOf(get());
      const replayed = replayQueued(loadedUpdatedAt);
      debugLog("canvas-load", "ok", {
        projectId,
        nodes: get().nodes.length,
        edges: get().edges.length,
        updatedAt: loadedUpdatedAt,
        stuckCleared: stuck.cleared,
        replayed,
        dirty: get().dirty,
        mergedExtras,
        strippedDeleted,
        deletedNodeIds: tombstones.nodeIds,
      });
      if (mergedExtras || strippedDeleted || persistRicher) void get().saveProject();
      else if (reason !== "poll" && (migrated.changed || stuck.cleared > 0)) debouncedSave(get(), set);
    } catch (err) {
      console.error("[canvas-load] failed", { projectId, error: err instanceof Error ? err.message : "error" });
      debugLog("canvas-load", "failed", { projectId, error: err instanceof Error ? err.message : "error" }, "error");
      patchesDuringLoad = [];
      if (switching || force || !get().loaded) {
        set({ loaded: true, loading: false, currentProjectId: projectId, knownUpdatedAt: null, coverImageUrl: null, deletedNodeIds: [], deletedEdgeIds: [], history: [{ nodes: [], edges: [] }], historyIndex: 0 });
      } else {
        set({ loading: false });
      }
    } finally {
      if (inFlightProjectLoads.get(projectId)) inFlightProjectLoads.delete(projectId);
      resolveInflight();
    }
  },

  setCoverImage: async (url: string) => {
    const { currentProjectId, coverImageUrl: previous } = get();
    const nextId = generatedImageIdFromUrl(url);
    if (!nextId) return false;
    if (previous && generatedImageIdFromUrl(previous) === nextId) return true;
    set({ coverImageUrl: url });
    try {
      const res = await fetch(`/api/projects?id=${encodeURIComponent(currentProjectId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coverImageUrl: url }),
      });
      if (!res.ok) {
        set({ coverImageUrl: previous });
        return false;
      }
      return true;
    } catch {
      set({ coverImageUrl: previous });
      return false;
    }
  },

  saveProject: async (projectId?: string) => {
    // knownUpdatedAt is read with the nodes: the base of exactly this payload.
    const { nodes, edges, saving, currentProjectId, knownUpdatedAt, deletedNodeIds, deletedEdgeIds } = get();
    const pid = projectId || currentProjectId;
    const outgoingKey = persistKeyOf({ nodes, edges, deletedNodeIds, deletedEdgeIds });
    if (saving) {
      // A drag (or any edit) landed while POST /api/project is in flight. The
      // in-flight payload has the old positions; dropping this call used to
      // clear `dirty` when that POST returned and let the 2s poll reload the
      // stale server canvas — the node snapped back.
      if (outgoingKey === inFlightPersistKey) {
        debugLog("canvas-save", "skip queued identical", { projectId: pid, epoch: mutationEpoch });
        return;
      }
      saveQueued = true;
      debugLog("canvas-save", "queued (in-flight)", { projectId: pid, epoch: mutationEpoch });
      return;
    }

    if (lastSentPersistKey === outgoingKey && !get().saveError) {
      set({ dirty: false });
      return;
    }

    const epochAtStart = mutationEpoch;
    set({ saving: true, saveError: null });
    inFlightPersistKey = outgoingKey;
    if (lastSentPersistKey !== outgoingKey) {
      debugLog("canvas-save", "start", {
        projectId: pid,
        nodes: nodes.length,
        edges: edges.length,
        baseUpdatedAt: knownUpdatedAt,
        deletedNodeIds,
        epoch: epochAtStart,
      });
    }
    let finishSave: () => void = () => {};
    let projectGone = false;
    inFlightSave = new Promise<void>((resolve) => {
      finishSave = resolve;
    });
    const retryIfStale = () => {
      const retry = saveQueued || mutationEpoch !== epochAtStart;
      saveQueued = false;
      set({ saving: false });
      inFlightPersistKey = null;
      inFlightSave = null;
      finishSave();
      if (!retry) return;
      const latest = get();
      if (persistKeyOf(latest) === outgoingKey) {
        set({ dirty: false });
        return;
      }
      void latest.saveProject();
    };
    try {
      const buildBody = (sourceNodes: typeof nodes) => {
        const cleanNodes = persistNodesForSave(sourceNodes);
        return {
          cleanNodes,
          body: JSON.stringify({
            projectId: pid,
            nodes: cleanNodes,
            edges,
            ...(knownUpdatedAt !== null ? { baseUpdatedAt: knownUpdatedAt } : {}),
            deletedNodeIds,
            deletedEdgeIds,
          }),
        };
      };

      let { cleanNodes, body } = buildBody(nodes);
      const postOnce = () =>
        fetch("/api/project", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        });

      if (body.length > PROJECT_SAVE_MAX_BYTES || body.includes("data:image")) {
        debugLog("canvas-save", "strip oversized", { projectId: pid, bytes: body.length, nodes: cleanNodes.length });
        ({ cleanNodes, body } = buildBody(get().nodes));
      }

      let res = await postOnce();
      if (res.status === 413) {
        debugLog("canvas-save", "retry stripped", { projectId: pid, status: 413, bytes: body.length, nodes: cleanNodes.length });
        ({ cleanNodes, body } = buildBody(get().nodes));
        res = await postOnce();
      }
      if (!res.ok) {
        console.error("[canvas-save] HTTP", { projectId: pid, status: res.status, nodes: cleanNodes.length });
        if (res.status === 404) {
          // Deleted from the gallery (or never existed): a retry would recreate the card.
          projectGone = true;
          saveQueued = false;
          get().cancelPendingSave();
          set({ dirty: false, saveError: "Projet introuvable" });
          debugLog("canvas-save", "404 stop retry", { projectId: pid, status: 404, nodes: cleanNodes.length }, "error");
          return;
        }
        const saveError = res.status === 413 ? PAYLOAD_TOO_LARGE_FR : "Erreur de sauvegarde";
        debugLog("canvas-save", "HTTP error", { projectId: pid, status: res.status, nodes: cleanNodes.length }, "error");
        set({ dirty: true, saveError });
        return;
      }
      // Record the updated_at the server assigned to this save, if it sent
      // one back, so useCanvasSync's poll can recognize its own autosave
      // landing and not mistake it for an external change. Keeps the last
      // MAX_RECENT_SELF_SAVES rather than just the latest — see the
      // recentOwnSaveUpdatedAts doc comment on CanvasState for why a single
      // value isn't enough.
      let updatedAt: string | undefined;
      let reinjected: AppNode[] = [];
      let reinjectedEdges: Edge[] = [];
      let refreshed: AppNode[] = [];
      let removed: string[] = [];
      let serverDeletedNodes: string[] | null = null;
      let serverDeletedEdges: string[] | null = null;
      let unchanged = false;
      try {
        const body = (await res.json()) as {
          updatedAt?: string;
          reinjected?: unknown;
          reinjectedEdges?: unknown;
          refreshed?: unknown;
          removed?: unknown;
          deletedNodeIds?: unknown;
          deletedEdgeIds?: unknown;
          unchanged?: unknown;
        };
        if (Array.isArray(body.removed)) removed = body.removed.filter((id): id is string => typeof id === "string");
        updatedAt = typeof body.updatedAt === "string" ? body.updatedAt : undefined;
        if (Array.isArray(body.reinjected)) reinjected = body.reinjected as AppNode[];
        if (Array.isArray(body.reinjectedEdges)) reinjectedEdges = body.reinjectedEdges as Edge[];
        if (Array.isArray(body.refreshed)) refreshed = body.refreshed as AppNode[];
        if (Array.isArray(body.deletedNodeIds)) serverDeletedNodes = asDeletedIds(body.deletedNodeIds);
        if (Array.isArray(body.deletedEdgeIds)) serverDeletedEdges = asDeletedIds(body.deletedEdgeIds);
        unchanged = body.unchanged === true;
      } catch {
        // Response wasn't JSON (e.g. a proxy error page) — keep the
        // previously recorded self-save timestamps rather than fail the save.
      }
      // What the server kept from the agent joins the local canvas without a
      // history entry — unless another project was opened while the save ran:
      // agent nodes this payload lacked (reinjected, with their edges when
      // both ends are here) and the agent's newer data of payload nodes
      // (refreshed; the local position is kept).
      const beforeRemoval = get();
      const sameProject = beforeRemoval.currentProjectId === pid;
      // A stale POST must not delete a preview that landed while it ran.
      // Interview nodes this save sent and the server dropped still go.
      const liveIds = new Set(beforeRemoval.nodes.map((node) => node.id));
      const outgoingNodeIds = new Set(nodes.map((node) => node.id));
      const applyRemoved = sameProject
        ? removed.filter((id) => !liveIds.has(id) || outgoingNodeIds.has(id))
        : [];
      const removedIds = new Set(applyRemoved);
      const current =
        removedIds.size > 0
          ? {
              ...beforeRemoval,
              nodes: beforeRemoval.nodes.filter((node) => !removedIds.has(node.id)),
              edges: beforeRemoval.edges.filter((edge) => !removedIds.has(edge.source) && !removedIds.has(edge.target)),
            }
          : beforeRemoval;
      const localIds = new Set(current.nodes.map((node) => node.id));
      const editedDuringSave = mutationEpoch !== epochAtStart || saveQueued;
      const nextDeletedNodes = sameProject
        ? exceptLiveIds(
            editedDuringSave
              ? current.deletedNodeIds
              : unionDeletedIds(serverDeletedNodes ?? current.deletedNodeIds, applyRemoved),
            current.nodes,
          )
        : current.deletedNodeIds;
      const nextDeletedEdges = sameProject
        ? exceptLiveIds(serverDeletedEdges ?? current.deletedEdgeIds, current.edges)
        : current.deletedEdgeIds;
      const tombstoneNodes = new Set(nextDeletedNodes);
      const tombstoneEdges = new Set(nextDeletedEdges);
      const addedNodes = sameProject
        ? reinjected.filter((node) => !localIds.has(node.id) && !tombstoneNodes.has(node.id))
        : [];
      const skippedReinject = sameProject && reinjected.some((node) => tombstoneNodes.has(node.id));
      const refreshedById = new Map(sameProject ? refreshed.map((node) => [node.id, node]) : []);
      const mergedNodes =
        refreshedById.size > 0
          ? current.nodes.map((node) => {
              const newer = refreshedById.get(node.id);
              return newer ? { ...node, data: newer.data } : node;
            })
          : current.nodes;
      const finalIds = new Set([...localIds, ...addedNodes.map((node) => node.id)]);
      const addedEdges = sameProject
        ? newEdges(current.edges, reinjectedEdges).filter(
            (edge) => !tombstoneEdges.has(edge.id) && finalIds.has(edge.source) && finalIds.has(edge.target),
          )
        : [];
      const candidateNodes =
        addedNodes.length > 0 || refreshedById.size > 0 || removedIds.size > 0
          ? [...mergedNodes, ...addedNodes]
          : current.nodes;
      const candidateEdges = addedEdges.length > 0 || removedIds.size > 0 ? [...current.edges, ...addedEdges] : current.edges;
      // A persist-equal echo (stripped pixels, same ids/positions) must not
      // replace local nodes: that remounts React Flow and re-hydrates bytes.
      // `current` already dropped `removed` — compare refresh against that.
      const persistEqualRefresh =
        refreshedById.size > 0 &&
        persistGraphEqual({ nodes: current.nodes, edges: current.edges }, { nodes: mergedNodes, edges: current.edges });
      const applyNodes = addedNodes.length > 0 || removedIds.size > 0 || (refreshedById.size > 0 && !persistEqualRefresh);
      const applyEdges = addedEdges.length > 0 || removedIds.size > 0;
      if (applyNodes || applyEdges) armFlowReconcileGuard();
      // Keep dirty when the canvas changed during this POST: the payload is
      // stale and a follow-up save must run (see retryIfStale).
      set({
        dirty: editedDuringSave,
        saveError: null,
        ...(sameProject ? { deletedNodeIds: nextDeletedNodes, deletedEdgeIds: nextDeletedEdges } : {}),
        ...(updatedAt
          ? { recentOwnSaveUpdatedAts: [...current.recentOwnSaveUpdatedAts, updatedAt].slice(-MAX_RECENT_SELF_SAVES) }
          : {}),
        ...(updatedAt && sameProject ? { knownUpdatedAt: laterUpdatedAt(current.knownUpdatedAt, updatedAt), lastSavedAt: editedDuringSave ? current.lastSavedAt : updatedAt } : {}),
        ...(applyNodes ? { nodes: candidateNodes } : {}),
        ...(applyEdges ? { edges: candidateEdges } : {}),
      });
      if (sameProject && !editedDuringSave) lastSentPersistKey = persistKeyOf(get());
      debugLog("canvas-save", unchanged ? "skip unchanged" : "ok", {
        projectId: pid,
        updatedAt,
        dirty: editedDuringSave,
        reinjected: addedNodes.map((node) => node.id),
        skippedReinject,
        refreshed: [...refreshedById.keys()],
        removed,
        deletedNodeIds: nextDeletedNodes,
        unchanged,
      });
    } catch (err) {
      console.error("[canvas-save] failed", { projectId: pid, error: err instanceof Error ? err.message : "error" });
      debugLog("canvas-save", "failed", { projectId: pid, error: err instanceof Error ? err.message : "error" }, "error");
      set({ dirty: true, saveError: "Erreur de sauvegarde" });
    } finally {
      if (projectGone) {
        saveQueued = false;
        set({ saving: false });
        inFlightPersistKey = null;
        inFlightSave = null;
        finishSave();
        return;
      }
      retryIfStale();
    }
  },

  flushPendingSave: async () => {
    const hadScheduledSave = saveTimeout !== null;
    get().cancelPendingSave();
    // A save already running captured the nodes of its start; wait for it. If a
    // drag arrived during that POST, dirty stays set and we save again.
    if (inFlightSave) await inFlightSave;
    if (hadScheduledSave || get().dirty) await get().saveProject();
  },

  cancelPendingSave: () => {
    if (saveTimeout) {
      clearTimeout(saveTimeout);
      saveTimeout = null;
    }
  },
}));
