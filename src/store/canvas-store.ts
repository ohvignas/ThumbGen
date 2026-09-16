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

export type NodeData = {
  label?: string;
  imageUrl?: string;
  imageBase64?: string;
  // swipeFile only: a logo plugs into the generator's logo-in, a reference
  // image into ref-in. Older nodes have no kind (see catalogIdForNode).
  kind?: "reference" | "logo";
  // Personnage: a reusable multi-angle face reference (front/left/right),
  // captured via webcam or uploaded. Populated instead of imageUrl/imageBase64
  // when the faceReference node represents a full persona rather than a
  // single photo.
  personaId?: string;
  personaAngles?: { front?: string; left?: string; right?: string };
  prompt?: string;
  negativePrompt?: string;
  model?: string;
  ideogramMode?: "generate" | "remix" | "edit";
  aspectRatio?: string;
  imageSize?: ImageResolution; // output resolution; unset → the defaultResolution setting
  imageWeight?: number;
  styleType?: string;
  renderingSpeed?: string;
  isGenerating?: boolean;
  generatedImages?: string[];
  selectedImageIndex?: number;
  maskDataUrl?: string;
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
  currentProjectId: string;
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
  updateNodeData: (nodeId: string, data: Partial<NodeData>) => void;
  removeNode: (nodeId: string) => void;
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
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  loadProject: (projectId?: string) => Promise<void>;
  saveProject: (projectId?: string) => Promise<void>;
}

let saveTimeout: ReturnType<typeof setTimeout> | null = null;

function debouncedSave(state: CanvasState, set: (s: Partial<CanvasState>) => void) {
  set({ dirty: true });
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    state.saveProject();
  }, 2000);
}

const MAX_HISTORY = 50;

// How many of the app's own recent save timestamps useCanvasSync's poll
// remembers — see the recentOwnSaveUpdatedAts doc comment on CanvasState.
const MAX_RECENT_SELF_SAVES = 5;

let historyTimeout: ReturnType<typeof setTimeout> | null = null;

function pushHistory(get: () => CanvasState, set: (s: Partial<CanvasState>) => void) {
  // Debounce history snapshots so rapid changes (e.g. dragging) collapse into one
  if (historyTimeout) clearTimeout(historyTimeout);
  historyTimeout = setTimeout(() => {
    const { nodes, edges, history, historyIndex } = get();
    const newSnapshot: Snapshot = {
      nodes: JSON.parse(JSON.stringify(nodes)),
      edges: JSON.parse(JSON.stringify(edges)),
    };
    // Discard any forward history after current index
    const newHistory = [...history.slice(0, historyIndex + 1), newSnapshot].slice(-MAX_HISTORY);
    set({ history: newHistory, historyIndex: newHistory.length - 1 });
  }, 300);
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  nodes: [],
  edges: [],
  loaded: false,
  saving: false,
  dirty: false,
  recentOwnSaveUpdatedAts: [],
  currentProjectId: "default",
  history: [],
  historyIndex: -1,
  nodePicker: null,

  onNodesChange: (changes) => {
    set({ nodes: applyNodeChanges(changes, get().nodes) });
    if (get().loaded) {
      pushHistory(get, set);
      debouncedSave(get(), set);
    }
  },

  onEdgesChange: (changes) => {
    set({ edges: applyEdgeChanges(changes, get().edges) });
    if (get().loaded) {
      pushHistory(get, set);
      debouncedSave(get(), set);
    }
  },

  onConnect: (connection) => {
    set({
      edges: addEdge({ ...connection, type: "custom" }, get().edges),
    });
    if (get().loaded) {
      pushHistory(get, set);
      debouncedSave(get(), set);
    }
  },

  addNode: (type, position, data = {}) => {
    const id = uuid();
    const newNode: AppNode = { id, type, position, data: { ...data } };
    set({ nodes: [...get().nodes, newNode] });
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
    set({
      nodes: [...get().nodes, newNode],
      edges: [...get().edges, newEdge],
    });
    if (get().loaded) {
      pushHistory(get, set);
      debouncedSave(get(), set);
    }
    return id;
  },

  updateNodeData: (nodeId, data) => {
    set({
      nodes: get().nodes.map((node) =>
        node.id === nodeId ? { ...node, data: { ...node.data, ...data } } : node
      ),
    });
    if (get().loaded) {
      pushHistory(get, set);
      debouncedSave(get(), set);
    }
  },

  removeNode: (nodeId) => {
    set({
      nodes: get().nodes.filter((n) => n.id !== nodeId),
      edges: get().edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
    });
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
    const copy: AppNode = {
      id,
      type: source.type,
      position: { x: source.position.x + 40, y: source.position.y + 40 },
      data,
    };
    set({ nodes: [...get().nodes, copy] });
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

  undo: () => {
    const { history, historyIndex } = get();
    if (historyIndex <= 0) return;
    const newIndex = historyIndex - 1;
    const snapshot = history[newIndex];
    set({
      nodes: JSON.parse(JSON.stringify(snapshot.nodes)),
      edges: JSON.parse(JSON.stringify(snapshot.edges)),
      historyIndex: newIndex,
    });
    debouncedSave(get(), set);
  },

  redo: () => {
    const { history, historyIndex } = get();
    if (historyIndex >= history.length - 1) return;
    const newIndex = historyIndex + 1;
    const snapshot = history[newIndex];
    set({
      nodes: JSON.parse(JSON.stringify(snapshot.nodes)),
      edges: JSON.parse(JSON.stringify(snapshot.edges)),
      historyIndex: newIndex,
    });
    debouncedSave(get(), set);
  },

  canUndo: () => get().historyIndex > 0,
  canRedo: () => get().historyIndex < get().history.length - 1,

  loadProject: async (projectId = "default") => {
    try {
      const res = await fetch(`/api/project?id=${projectId}`);
      if (!res.ok) {
        console.warn("Project load returned non-OK status, using fallback");
        set({ loaded: true, currentProjectId: projectId, history: [{ nodes: [], edges: [] }], historyIndex: 0 });
        return;
      }
      const data = await res.json();
      // Lazy migrations (legacy "image-in" handle, single-photo face nodes →
      // reference images) — see migrateCanvas. When anything changed, the
      // normal debounced autosave persists the converted canvas.
      const migrated = migrateCanvas(data.nodes || [], data.edges || []);
      const initialSnapshot: Snapshot = {
        nodes: JSON.parse(JSON.stringify(migrated.nodes)),
        edges: JSON.parse(JSON.stringify(migrated.edges)),
      };
      set({
        nodes: migrated.nodes,
        edges: migrated.edges,
        loaded: true,
        currentProjectId: projectId,
        history: [initialSnapshot],
        historyIndex: 0,
      });
      if (migrated.changed) debouncedSave(get(), set);
    } catch (err) {
      console.error("Failed to load project:", err);
      set({ loaded: true, currentProjectId: projectId, history: [{ nodes: [], edges: [] }], historyIndex: 0 });
    }
  },

  saveProject: async (projectId?: string) => {
    const { nodes, edges, saving, currentProjectId } = get();
    const pid = projectId || currentProjectId;
    if (saving) return;

    set({ saving: true });
    try {
      // Strip large base64 data — generated images are saved on disk as files
      const cleanNodes = nodes.map((n) => {
        const cleanData = { ...n.data, isGenerating: undefined };

        // For preview nodes, keep only URL-based images (strip base64)
        if (n.type === "preview" && cleanData.generatedImages) {
          cleanData.generatedImages = cleanData.generatedImages.map((img: string) =>
            img.startsWith("data:") ? undefined : img
          ).filter(Boolean) as string[];
        }

        // Strip imageBase64 from face/swipe nodes if they have an imageUrl
        if (cleanData.imageUrl && cleanData.imageBase64) {
          cleanData.imageBase64 = undefined;
        }

        return {
          id: n.id,
          type: n.type,
          position: n.position,
          data: cleanData,
        };
      });

      const res = await fetch("/api/project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: pid, nodes: cleanNodes, edges }),
      });
      // Record the updated_at the server assigned to this save, if it sent
      // one back, so useCanvasSync's poll can recognize its own autosave
      // landing and not mistake it for an external change. Keeps the last
      // MAX_RECENT_SELF_SAVES rather than just the latest — see the
      // recentOwnSaveUpdatedAts doc comment on CanvasState for why a single
      // value isn't enough.
      let updatedAt: string | undefined;
      try {
        const body = (await res.json()) as { updatedAt?: string };
        updatedAt = body.updatedAt;
      } catch {
        // Response wasn't JSON (e.g. a proxy error page) — keep the
        // previously recorded self-save timestamps rather than fail the save.
      }
      // Note: dirty clears here once the fetch call has resolved at all —
      // this does NOT check res.ok, so a server error (e.g. a 500) still
      // clears dirty even though the edit never actually persisted. That's
      // pre-existing behavior, unrelated to the undo/sync-poll fix this
      // function is otherwise annotated for; left as-is here.
      set({
        dirty: false,
        ...(updatedAt
          ? { recentOwnSaveUpdatedAts: [...get().recentOwnSaveUpdatedAts, updatedAt].slice(-MAX_RECENT_SELF_SAVES) }
          : {}),
      });
    } catch (err) {
      console.error("Failed to save project:", err);
    } finally {
      set({ saving: false });
    }
  },
}));
