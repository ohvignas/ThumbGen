"use client";

import { useState } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { useCanvasStore, AppNode } from "@/store/canvas-store";
import NodeShell from "./NodeShell";

export default function PromptNode({ id, data }: NodeProps<AppNode>) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const removeNode = useCanvasStore((s) => s.removeNode);
  const allNodes = useCanvasStore((s) => s.nodes);
  const allEdges = useCanvasStore((s) => s.edges);

  // Collect workflow context: find what's connected to the same Generator as this Prompt
  const getWorkflowContext = () => {
    const connectedGenerators = allEdges
      .filter((e) => e.source === id && e.targetHandle === "prompt-in")
      .map((e) => e.target);

    if (connectedGenerators.length === 0) {
      const faces = allNodes.filter((n) => n.type === "faceReference" && (n.data.imageBase64 || n.data.imageUrl));
      const logos = allNodes.filter((n) => n.type === "swipeFile" && n.data.label && n.data.label !== "Image");
      const refs = allNodes.filter((n) => n.type === "swipeFile");
      const sketches = allNodes.filter((n) => n.type === "sketch" && n.data.imageBase64);
      return {
        faces: faces.length,
        logos: logos.map((n) => n.data.label || "Logo"),
        references: refs.length,
        hasSketch: sketches.length > 0,
      };
    }

    const genEdges = allEdges.filter((e) => connectedGenerators.includes(e.target));
    const sourceIds = new Set(genEdges.map((e) => e.source));
    const connectedNodes = allNodes.filter((n) => sourceIds.has(n.id) && n.id !== id);

    const faces = connectedNodes.filter((n) => n.type === "faceReference");
    const logoEdges = genEdges.filter((e) => e.targetHandle === "logo-in");
    const logoNodes = connectedNodes.filter((n) => logoEdges.some((e) => e.source === n.id));
    const refNodes = connectedNodes.filter((n) => n.type === "swipeFile" && !logoEdges.some((e) => e.source === n.id));
    const sketches = connectedNodes.filter((n) => n.type === "sketch" && n.data.imageBase64);
    const gen = allNodes.find((n) => connectedGenerators.includes(n.id));

    const previewRefs = connectedNodes.filter((n) => n.type === "preview" && n.data.genPromptUsed);
    const previousPrompts = previewRefs.map((n) => n.data.genPromptUsed as string);

    return {
      faces: faces.length,
      logos: logoNodes.map((n) => n.data.label || "Logo"),
      references: refNodes.length,
      hasSketch: sketches.length > 0,
      aspectRatio: gen?.data.aspectRatio || "16x9",
      previousPrompts,
    };
  };

  const [enhancing, setEnhancing] = useState(false);

  const handleEnhance = async () => {
    const currentPrompt = data.prompt;
    if (!currentPrompt) return;
    setEnhancing(true);
    try {
      const context = getWorkflowContext();
      const res = await fetch("/api/enhance-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: currentPrompt, context }),
      });
      const result = await res.json();
      if (result.enhanced) {
        updateNodeData(id, { prompt: result.enhanced });
      }
    } catch {
      // silently fail
    } finally {
      setEnhancing(false);
    }
  };

  return (
    <NodeShell title="Prompt" onDelete={() => removeNode(id)} width={380}>
      <div className="space-y-2">
        <textarea
          value={data.prompt || ""}
          onChange={(e) => updateNodeData(id, { prompt: e.target.value })}
          placeholder="Décris ta miniature : un gros plan de mon visage choqué avec le logo Claude…"
          className="w-full h-24 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none nopan nodrag"
          style={{ background: "var(--surface)", color: "var(--text-primary)", border: "1px solid transparent" }}
          onFocus={(e) => (e.currentTarget.style.borderColor = "var(--accent)")}
          onBlur={(e) => (e.currentTarget.style.borderColor = "transparent")}
        />

        {data.prompt && (
          <button
            onClick={handleEnhance}
            disabled={enhancing}
            className="w-full py-2 rounded-xl text-xs font-medium transition-all flex items-center justify-center gap-2 nopan nodrag"
            style={{
              background: enhancing ? "var(--surface)" : "rgba(110, 221, 179, 0.1)",
              color: enhancing ? "var(--text-muted)" : "var(--accent)",
              border: "1px solid rgba(110, 221, 179, 0.2)",
            }}
          >
            {enhancing ? (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
                  <circle cx="12" cy="12" r="10" strokeDasharray="60" strokeDashoffset="20" />
                </svg>
                Amélioration en cours…
              </>
            ) : (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M12 2L9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61z" />
                </svg>
                Améliorer le prompt
              </>
            )}
          </button>
        )}

        <textarea
          value={data.negativePrompt || ""}
          onChange={(e) => updateNodeData(id, { negativePrompt: e.target.value })}
          placeholder="Negative prompt (optional)..."
          className="w-full h-12 rounded-xl px-4 py-2 text-xs resize-none focus:outline-none nopan nodrag"
          style={{ background: "var(--surface)", color: "var(--text-tertiary)", border: "1px solid transparent" }}
          onFocus={(e) => (e.currentTarget.style.borderColor = "var(--accent)")}
          onBlur={(e) => (e.currentTarget.style.borderColor = "transparent")}
        />
      </div>

      <Handle type="source" position={Position.Right} id="prompt" />
      <div className="handle-label handle-label-right" style={{ top: "50%", right: -8, transform: "translateX(100%) translateY(-50%)" }}>
        <span style={{ color: "var(--accent)", fontSize: 10 }}>Prompt</span>
      </div>
    </NodeShell>
  );
}
