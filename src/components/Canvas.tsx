"use client";

import {
  ReactFlow,
  Background,
  BackgroundVariant,
  ReactFlowProvider,
  Panel,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { useCanvasStore } from "@/store/canvas-store";
import FaceReferenceNode from "./nodes/FaceReferenceNode";
import SwipeFileNode from "./nodes/SwipeFileNode";
import PromptNode from "./nodes/PromptNode";
import GeneratorNode from "./nodes/GeneratorNode";
import PreviewNode from "./nodes/PreviewNode";
import SketchNode from "./nodes/SketchNode";
import CustomEdge from "./edges/CustomEdge";
import Sidebar from "./panels/Sidebar";
import ZoomBar from "./panels/ZoomBar";
import ChatPanel from "./panels/ChatPanel";
import ContextMenu from "./panels/ContextMenu";
import ProjectBar from "./panels/ProjectBar";
import SketchEditor from "./panels/SketchEditor";
import { useCallback, useState, useEffect, useRef } from "react";
import { DragEvent } from "react";
import { useReactFlow, OnConnectStart } from "@xyflow/react";
import { useCanvasSync } from "@/hooks/useCanvasSync";

const nodeTypes = {
  faceReference: FaceReferenceNode,
  swipeFile: SwipeFileNode,
  prompt: PromptNode,
  generator: GeneratorNode,
  preview: PreviewNode,
  sketch: SketchNode,
};

const edgeTypes = {
  custom: CustomEdge,
};

const defaultEdgeOptions = {
  type: "custom",
  animated: false,
};

const STAR_ICON = (color: string, fill = false) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill={fill ? color : "none"} stroke={fill ? "none" : color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2L9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61z" />
  </svg>
);

function CanvasInner() {
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, addNode, addNodeAndConnect, loadProject, saving, currentProjectId } =
    useCanvasStore();
  const { screenToFlowPosition } = useReactFlow();
  const [providers, setProviders] = useState<Record<string, boolean>>({ gemini: true });
  const [favoriteModel, setFavoriteModel] = useState("gemini-3.1-flash-image-preview");

  useEffect(() => {
    fetch("/api/settings").then((r) => r.json()).then((s) => {
      setProviders({ gemini: !!s.hasGemini, ideogram: !!s.hasIdeogram, openai: !!s.hasOpenai, grok: !!s.hasGrok });
      if (s.favoriteModel) setFavoriteModel(s.favoriteModel);
    }).catch(() => {});
  }, []);

  // Load last-opened project on mount (falls back to "default" when none was saved)
  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((s) => loadProject(s.currentProjectId || "default"))
      .catch(() => loadProject());
  }, [loadProject]);

  // Poll for external mutations (agent / MCP client) and refresh the canvas
  useCanvasSync(currentProjectId);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    flowPos: { x: number; y: number };
  } | null>(null);

  // Edge drop menu state
  const [edgeDropMenu, setEdgeDropMenu] = useState<{
    x: number;
    y: number;
    flowPos: { x: number; y: number };
    sourceNodeId: string;
    sourceHandleId: string;
  } | null>(null);
  const connectStartRef = useRef<{ nodeId: string; handleId: string; handleType: string } | null>(null);
  const justOpenedEdgeMenuRef = useRef(false);

  const onConnectStart: OnConnectStart = useCallback((_event, params) => {
    connectStartRef.current = {
      nodeId: params.nodeId || "",
      handleId: params.handleId || "",
      handleType: params.handleType || "source",
    };
  }, []);

  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent) => {
      const target = event.target as HTMLElement;
      // If dropped on a handle, a real connection was made — don't show menu
      if (target.closest(".react-flow__handle")) return;
      if (!connectStartRef.current?.nodeId) return;

      const clientX = "clientX" in event ? event.clientX : event.changedTouches[0].clientX;
      const clientY = "clientY" in event ? event.clientY : event.changedTouches[0].clientY;

      const flowPos = screenToFlowPosition({ x: clientX, y: clientY });

      // Flag to prevent onPaneClick from immediately clearing the menu
      justOpenedEdgeMenuRef.current = true;
      setTimeout(() => { justOpenedEdgeMenuRef.current = false; }, 100);

      setEdgeDropMenu({
        x: clientX,
        y: clientY,
        flowPos,
        sourceNodeId: connectStartRef.current.nodeId,
        sourceHandleId: connectStartRef.current.handleId,
      });
    },
    [screenToFlowPosition]
  );

  const addConnectedNode = useCallback(
    (type: string, data?: Record<string, unknown>) => {
      if (!edgeDropMenu) return;
      const draggedFromSource = connectStartRef.current?.handleType === "source";
      const sourceHandleId = edgeDropMenu.sourceHandleId;

      // Determine which handle on the NEW node to connect to
      let newNodeHandle: string | undefined;
      if (draggedFromSource) {
        // Dragged from a source handle → new node is the target
        if (type === "generator") {
          // If source is an image handle, connect to ref-in; otherwise prompt-in
          const isFaceHandle = sourceHandleId === "face";
          const isImageHandle = ["image", "face", "preview-out", "result"].includes(sourceHandleId);
          newNodeHandle = isFaceHandle ? "face-in" : isImageHandle ? "ref-in" : "prompt-in";
        } else if (type === "preview") {
          newNodeHandle = "preview-in";
        }
      } else {
        // Dragged from a target handle → new node is the source
        if (type === "prompt") newNodeHandle = undefined; // prompt nodes use default
        else if (type === "swipeFile") newNodeHandle = "image";
        else if (type === "faceReference") newNodeHandle = "face";
      }

      addNodeAndConnect(
        type,
        edgeDropMenu.flowPos,
        edgeDropMenu.sourceNodeId,
        sourceHandleId,
        newNodeHandle,
        data,
        draggedFromSource,
      );
      setEdgeDropMenu(null);
    },
    [edgeDropMenu, addNodeAndConnect]
  );

  const onDragOver = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault();
      const type = event.dataTransfer.getData("application/reactflow-type");
      if (!type) return;

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const rawData = event.dataTransfer.getData("application/reactflow-data");
      const data = rawData ? JSON.parse(rawData) : {};

      addNode(type, position, data);
    },
    [screenToFlowPosition, addNode]
  );

  const onPaneContextMenu = useCallback(
    (event: MouseEvent | React.MouseEvent) => {
      event.preventDefault();
      const clientX = "clientX" in event ? event.clientX : 0;
      const clientY = "clientY" in event ? event.clientY : 0;
      const flowPos = screenToFlowPosition({ x: clientX, y: clientY });
      setContextMenu({
        x: clientX,
        y: clientY,
        flowPos,
      });
    },
    [screenToFlowPosition]
  );

  const promptIcon = (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6h16M4 12h16M4 18h10" />
    </svg>
  );
  const faceIcon = (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--ember)" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="12" cy="8" r="5" /><path d="M20 21a8 8 0 0 0-16 0" />
    </svg>
  );
  const imageIcon = (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 15l5-5 4 4 4-6 5 7" />
    </svg>
  );

  const contextMenuSections = contextMenu
    ? [
        {
          title: "Entrées",
          items: [
            { label: "Prompt", icon: promptIcon, onClick: () => addNode("prompt", contextMenu.flowPos) },
            { label: "Croquis", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round"><path d="M12 19l7-7 3 3-7 7-3-3z" /><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" /></svg>, onClick: () => addNode("sketch", contextMenu.flowPos) },
            { label: "Visage de référence", icon: faceIcon, onClick: () => addNode("faceReference", contextMenu.flowPos) },
            { label: "Image / logo", icon: imageIcon, onClick: () => addNode("swipeFile", contextMenu.flowPos) },
          ],
        },
        {
          title: "",
          items: [
            { label: "Générateur", icon: STAR_ICON("var(--accent-yellow)", true), onClick: () => addNode("generator", contextMenu.flowPos, { model: favoriteModel }) },
          ],
        },
      ]
    : [];

  return (
    <div className="w-full h-screen" style={{ background: "var(--canvas-bg)" }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd}
        onPaneContextMenu={onPaneContextMenu}
        onPaneClick={() => {
          setContextMenu(null);
          if (!justOpenedEdgeMenuRef.current) {
            setEdgeDropMenu(null);
          }
        }}
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

        <Sidebar />
        <ZoomBar />
      </ReactFlow>

      <ChatPanel projectId={currentProjectId} />

      {/* Right-click context menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          sections={contextMenuSections}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Edge drop menu — appears when dragging a connection to empty space */}
      {edgeDropMenu && (
        <ContextMenu
          x={edgeDropMenu.x}
          y={edgeDropMenu.y}
          sections={[
            {
              title: "Entrées",
              items: [
                { label: "Prompt", icon: promptIcon, onClick: () => addConnectedNode("prompt") },
                { label: "Croquis", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round"><path d="M12 19l7-7 3 3-7 7-3-3z" /><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" /></svg>, onClick: () => addConnectedNode("sketch") },
                { label: "Visage de référence", icon: faceIcon, onClick: () => addConnectedNode("faceReference") },
                { label: "Image / logo", icon: imageIcon, onClick: () => addConnectedNode("swipeFile") },
              ],
            },
            {
              title: "",
              items: [
                { label: "Générateur", icon: STAR_ICON("var(--accent-yellow)", true), onClick: () => addConnectedNode("generator", { model: favoriteModel }) },
              ],
            },
            {
              title: "",
              items: [
                { label: "Aperçu", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></svg>, onClick: () => addConnectedNode("preview") },
              ],
            },
          ]}
          onClose={() => setEdgeDropMenu(null)}
        />
      )}

      <SketchEditor />
    </div>
  );
}

export default function Canvas() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  );
}
