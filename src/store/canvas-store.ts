import { create } from "zustand";
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

export type NodeData = {
  label?: string;
  imageUrl?: string;
  imageBase64?: string;
  prompt?: string;
  negativePrompt?: string;
  model?: string;
  ideogramMode?: "generate" | "remix" | "edit";
  aspectRatio?: string;
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
  selectedAxes?: Array<{ title: string; prompt: string }>; // Multiple selected prompt suggestions
  // Preview stats
  genStatus?: "loading" | "done" | "error";
  genError?: string;
  genTimeMs?: number;
  genPromptUsed?: string;
  genModel?: string;
  genTokens?: number;
  genCost?: string;
  axisColor?: string;
};

export type AppNode = Node<NodeData>;

type Snapshot = { nodes: AppNode[]; edges: Edge[] };

interface CanvasState {
  nodes: AppNode[];
  edges: Edge[];
  loaded: boolean;
  saving: boolean;
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

function debouncedSave(state: CanvasState) {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    state.saveProject();
  }, 2000);
}

const MAX_HISTORY = 50;

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
  currentProjectId: "default",
  history: [],
  historyIndex: -1,

  onNodesChange: (changes) => {
    set({ nodes: applyNodeChanges(changes, get().nodes) });
    if (get().loaded) {
      pushHistory(get, set);
      debouncedSave(get());
    }
  },

  onEdgesChange: (changes) => {
    set({ edges: applyEdgeChanges(changes, get().edges) });
    if (get().loaded) {
      pushHistory(get, set);
      debouncedSave(get());
    }
  },

  onConnect: (connection) => {
    set({
      edges: addEdge({ ...connection, type: "custom" }, get().edges),
    });
    if (get().loaded) {
      pushHistory(get, set);
      debouncedSave(get());
    }
  },

  addNode: (type, position, data = {}) => {
    const id = uuid();
    const newNode: AppNode = { id, type, position, data: { ...data } };
    set({ nodes: [...get().nodes, newNode] });
    if (get().loaded) {
      pushHistory(get, set);
      debouncedSave(get());
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
      debouncedSave(get());
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
      debouncedSave(get());
    }
  },

  removeNode: (nodeId) => {
    set({
      nodes: get().nodes.filter((n) => n.id !== nodeId),
      edges: get().edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
    });
    if (get().loaded) {
      pushHistory(get, set);
      debouncedSave(get());
    }
  },

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
        (n) => n.type === "preview" || n.type === "swipeFile" || n.type === "faceReference"
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
    debouncedSave(get());
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
    debouncedSave(get());
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
      const initialNodes = data.nodes || [];
      const initialEdges = data.edges || [];
      const initialSnapshot: Snapshot = {
        nodes: JSON.parse(JSON.stringify(initialNodes)),
        edges: JSON.parse(JSON.stringify(initialEdges)),
      };
      set({
        nodes: initialNodes,
        edges: initialEdges,
        loaded: true,
        currentProjectId: projectId,
        history: [initialSnapshot],
        historyIndex: 0,
      });
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

      await fetch("/api/project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: pid, nodes: cleanNodes, edges }),
      });
    } catch (err) {
      console.error("Failed to save project:", err);
    } finally {
      set({ saving: false });
    }
  },
}));
