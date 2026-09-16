"use client";

import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Panel,
  useReactFlow,
  type NodeMouseHandler,
  type OnConnectEnd,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { useCanvasStore, type AppNode } from "@/store/canvas-store";
import FaceReferenceNode from "./nodes/FaceReferenceNode";
import SwipeFileNode from "./nodes/SwipeFileNode";
import PromptNode from "./nodes/PromptNode";
import GeneratorNode from "./nodes/GeneratorNode";
import PreviewNode from "./nodes/PreviewNode";
import SketchNode from "./nodes/SketchNode";
import TextOverlayNode from "./nodes/TextOverlayNode";
import CustomEdge from "./edges/CustomEdge";
import ZoomBar from "./panels/ZoomBar";
import ChatPanel from "./panels/ChatPanel";
import ContextMenu from "./panels/ContextMenu";
import NodePicker from "./panels/NodePicker";
import CanvasEmptyState from "./panels/CanvasEmptyState";
import ProjectBar from "./panels/ProjectBar";
import SketchEditor from "./panels/SketchEditor";
import { useCallback, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCanvasSync } from "@/hooks/useCanvasSync";
import { useGeneratorDefaults } from "@/hooks/useGeneratorDefaults";
import { useAutoLayout } from "@/hooks/useAutoLayout";
import { useCanvasShortcuts } from "@/hooks/useCanvasShortcuts";
import { nodeMenuItems, paneMenuItems } from "@/lib/canvas/context-menus";
import { isEditableTarget } from "@/lib/canvas/shortcuts";

const nodeTypes = {
  faceReference: FaceReferenceNode,
  swipeFile: SwipeFileNode,
  prompt: PromptNode,
  generator: GeneratorNode,
  preview: PreviewNode,
  sketch: SketchNode,
  textOverlay: TextOverlayNode,
};

const edgeTypes = {
  custom: CustomEdge,
};

const defaultEdgeOptions = {
  type: "custom",
  animated: false,
};

type CanvasMenu =
  | { kind: "pane"; x: number; y: number; flowPos: { x: number; y: number } }
  | { kind: "node"; x: number; y: number; nodeId: string };

function CanvasInner({ projectId }: { projectId?: string }) {
  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    removeNode,
    duplicateNode,
    setAllSelected,
    openNodePicker,
    loadProject,
    saving,
    currentProjectId,
  } = useCanvasStore();
  const { screenToFlowPosition } = useReactFlow();
  const router = useRouter();
  const generatorDefaults = useGeneratorDefaults();
  const autoLayout = useAutoLayout();
  useCanvasShortcuts({ onAutoLayout: autoLayout });
  const [menu, setMenu] = useState<CanvasMenu | null>(null);

  // A projectId from the route wins: /m/<id> is a direct link to one
  // miniature, so it also becomes the "current" project everything else
  // (ProjectBar, chat, agent) reads from settings. Without one, fall back to
  // the last-opened project.
  useEffect(() => {
    if (projectId) {
      let cancelled = false;
      fetch("/api/projects")
        .then((r) => r.json() as Promise<Array<{ id: string }>>)
        .then((projects) => {
          if (cancelled) return;
          // Loading an unknown id would show an empty canvas whose first
          // autosave silently re-creates the project (saveProject upserts its
          // meta row) — e.g. a stale tab on a deleted project. Send it back to
          // the gallery instead.
          if (!projects.some((p) => p.id === projectId)) {
            router.replace("/miniatures");
            return;
          }
          loadProject(projectId);
          fetch("/api/settings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ currentProjectId: projectId }),
          }).catch(() => {});
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }
    fetch("/api/settings")
      .then((r) => r.json())
      .then((s) => loadProject(s.currentProjectId || "default"))
      .catch(() => loadProject());
  }, [loadProject, projectId, router]);

  // Poll for external mutations (agent / MCP client) and refresh the canvas
  useCanvasSync(currentProjectId);

  // A wire released on empty space opens the step picker restricted to the
  // steps compatible with the handle it came from.
  const onConnectEnd: OnConnectEnd = useCallback(
    (event, connectionState) => {
      // isValid is null only when the pointer was not over (or near) a handle.
      // But xyflow's getClosestHandle skips the handle the drag started from,
      // so releasing back onto that same handle also gives isValid === null
      // while still setting toHandle — that's not an empty-space release.
      if (connectionState.isValid !== null || connectionState.toHandle) return;
      const fromHandle = connectionState.fromHandle;
      if (!fromHandle?.id) return;
      const point = "changedTouches" in event ? event.changedTouches[0] : event;
      const flowPos = screenToFlowPosition({ x: point.clientX, y: point.clientY });
      const from = { nodeId: fromHandle.nodeId, handleId: fromHandle.id, handleType: fromHandle.type };
      // Deferred: the click that follows this pointer-up must not land on the
      // sheet's backdrop and close it right away.
      window.setTimeout(() => openNodePicker({ mode: "connect", flowPos, from }), 0);
    },
    [screenToFlowPosition, openNodePicker],
  );

  const onPaneContextMenu = useCallback(
    (event: MouseEvent | React.MouseEvent) => {
      event.preventDefault();
      const flowPos = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      setMenu({ kind: "pane", x: event.clientX, y: event.clientY, flowPos });
    },
    [screenToFlowPosition],
  );

  const onNodeContextMenu: NodeMouseHandler<AppNode> = useCallback((event, node) => {
    // Right-clicking a field (Prompt textarea, Texte overlay input, the node
    // rename input) or a generated image must keep the browser's own menu
    // (paste, spell-check, « Enregistrer l'image ») instead of ours.
    const target = event.target as HTMLElement;
    if (isEditableTarget(target) || target.closest?.("img")) return;
    event.preventDefault();
    setMenu({ kind: "node", x: event.clientX, y: event.clientY, nodeId: node.id });
  }, []);

  const hasSelection = nodes.some((n) => n.selected) || edges.some((e) => e.selected);
  const menuItems = !menu
    ? []
    : menu.kind === "pane"
      ? paneMenuItems({
          hasNodes: nodes.length > 0,
          hasSelection,
          onAddStep: () => {
            const flowPos = menu.flowPos;
            // Deferred for the same reason as onConnectEnd.
            window.setTimeout(() => openNodePicker({ mode: "free", flowPos }), 0);
          },
          onAutoLayout: autoLayout,
          onSelectAll: () => setAllSelected(true),
          onDeselectAll: () => setAllSelected(false),
        })
      : nodeMenuItems({
          onDuplicate: () => duplicateNode(menu.nodeId),
          onDelete: () => removeNode(menu.nodeId),
        });

  return (
    <div className="relative w-full h-screen" style={{ background: "var(--canvas-bg)" }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        onConnectEnd={onConnectEnd}
        onPaneContextMenu={onPaneContextMenu}
        onNodeContextMenu={onNodeContextMenu}
        onPaneClick={() => setMenu(null)}
        fitView={false}
        snapToGrid
        snapGrid={[20, 20]}
        minZoom={0.02}
        maxZoom={2}
        deleteKeyCode={["Backspace", "Delete"]}
        proOptions={{ hideAttribution: true }}
        style={{ background: "var(--canvas-bg)" }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={0.8}
          color="var(--bone-faint)"
        />

        {/* Project selector + save indicator */}
        <Panel position="top-left" className="!ml-16">
          <div className="flex items-center gap-3">
            <ProjectBar />
            {saving && (
              <span className="text-xs px-2 py-1 rounded-lg" style={{ color: "var(--text-muted)", background: "var(--node-bg)" }}>
                Enregistrement…
              </span>
            )}
          </div>
        </Panel>

        <ZoomBar />
      </ReactFlow>

      <CanvasEmptyState />

      <ChatPanel projectId={currentProjectId} />

      {menu && (
        <ContextMenu
          key={`${menu.kind}-${menu.x}-${menu.y}`}
          x={menu.x}
          y={menu.y}
          items={menuItems}
          onClose={() => setMenu(null)}
        />
      )}

      <NodePicker generatorDefaults={generatorDefaults} />

      <SketchEditor />
    </div>
  );
}

// The ReactFlowProvider lives in app/m/[id]/page.tsx, around AppSidebar and
// Canvas. Library items reach the canvas from the nodes (« Choisir dans la
// bibliothèque »), not by dragging from the sidebar.
export default function Canvas({ projectId }: { projectId?: string }) {
  return <CanvasInner projectId={projectId} />;
}
