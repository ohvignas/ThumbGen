"use client";

import { useState } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { useCanvasStore, AppNode } from "@/store/canvas-store";
import NodeShell from "./NodeShell";

type Suggestion = {
  title: string;
  description?: string;
  prompt: string;
};

export default function PromptNode({ id, data }: NodeProps<AppNode>) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const removeNode = useCanvasStore((s) => s.removeNode);
  const allNodes = useCanvasStore((s) => s.nodes);
  const allEdges = useCanvasStore((s) => s.edges);

  // Collect workflow context: find what's connected to the same Generator as this Prompt
  const getWorkflowContext = () => {
    // Find generators this prompt is connected to
    const connectedGenerators = allEdges
      .filter((e) => e.source === id && e.targetHandle === "prompt-in")
      .map((e) => e.target);

    if (connectedGenerators.length === 0) {
      // Fallback: check all nodes in canvas
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

    // Find all nodes connected to the same generator(s)
    const genEdges = allEdges.filter((e) => connectedGenerators.includes(e.target));
    const sourceIds = new Set(genEdges.map((e) => e.source));
    const connectedNodes = allNodes.filter((n) => sourceIds.has(n.id) && n.id !== id);

    const faces = connectedNodes.filter((n) => n.type === "faceReference");
    const logoEdges = genEdges.filter((e) => e.targetHandle === "logo-in");
    const logoNodes = connectedNodes.filter((n) => logoEdges.some((e) => e.source === n.id));
    const refNodes = connectedNodes.filter((n) => n.type === "swipeFile" && !logoEdges.some((e) => e.source === n.id));
    const sketches = connectedNodes.filter((n) => n.type === "sketch" && n.data.imageBase64);
    const gen = allNodes.find((n) => connectedGenerators.includes(n.id));

    // Collect previous prompts from Preview nodes used as references (for iteration)
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

  const [mode, setMode] = useState<"write" | "ai">("write");
  const [enhancing, setEnhancing] = useState(false);

  // AI mode state
  const [videoScript, setVideoScript] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [checkedAxes, setCheckedAxes] = useState<Set<number>>(new Set());
  const [showSuggestions, setShowSuggestions] = useState(true);

  // Enhance existing prompt with workflow context
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

  // Generate ideas
  const generateIdeas = async () => {
    if (!videoScript) return;
    setLoading(true);
    setError("");
    setSuggestions([]);
    setCheckedAxes(new Set());
    setShowSuggestions(true);

    try {
      const context = getWorkflowContext();
      const res = await fetch("/api/suggest-prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script: videoScript, context }),
      });
      const result = await res.json();
      if (result.error) setError(result.error);
      else setSuggestions(result.suggestions || []);
    } catch {
      setError("Erreur de connexion");
    } finally {
      setLoading(false);
    }
  };

  const toggleAxis = (index: number) => {
    setCheckedAxes((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const applySelectedAxes = () => {
    if (checkedAxes.size === 0) return;
    const axes = Array.from(checkedAxes).map((i) => ({
      title: suggestions[i].title,
      prompt: suggestions[i].prompt,
    }));
    if (axes.length === 1) {
      updateNodeData(id, { prompt: axes[0].prompt, selectedAxes: undefined });
      setMode("write");
    } else {
      updateNodeData(id, { prompt: axes[0].prompt, selectedAxes: axes });
      setShowSuggestions(false);
    }
  };

  const clearAxes = () => {
    updateNodeData(id, { selectedAxes: undefined });
    setCheckedAxes(new Set());
  };

  const hasAxes = data.selectedAxes && data.selectedAxes.length > 1;

  return (
    <NodeShell title="Prompt" onDelete={() => removeNode(id)} width={380}>
      {/* Tabs */}
      <div className="flex gap-1 mb-2">
        <button
          onClick={() => setMode("write")}
          className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
          style={{
            background: mode === "write" ? "var(--surface)" : "transparent",
            color: mode === "write" ? "var(--text-primary)" : "var(--text-muted)",
          }}
        >
          Écrire
        </button>
        <button
          onClick={() => setMode("ai")}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
          style={{
            background: mode === "ai" ? "var(--surface)" : "transparent",
            color: mode === "ai" ? "var(--accent)" : "var(--text-muted)",
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M12 2L9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61z" />
          </svg>
          Idées IA
        </button>
      </div>

      {/* ===== MODE ÉCRIRE ===== */}
      {mode === "write" && (
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

          {/* Enhance button */}
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
      )}

      {/* ===== MODE IDÉES IA ===== */}
      {mode === "ai" && (
        <div className="space-y-2">
          {/* Input + generate */}
          <div className="flex gap-2">
            <textarea
              value={videoScript}
              onChange={(e) => setVideoScript(e.target.value)}
              placeholder="Décris ta vidéo : sujet, titre, script, audience…"
              className="flex-1 h-16 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none nopan nodrag"
              style={{ background: "var(--surface)", color: "var(--text-primary)", border: "1px solid transparent" }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "var(--accent)")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "transparent")}
            />
            <button
              onClick={generateIdeas}
              disabled={loading || !videoScript}
              className="px-4 rounded-xl text-xs font-medium transition-all flex items-center gap-1 nopan nodrag flex-shrink-0"
              style={{
                background: loading ? "var(--surface)" : "var(--accent)",
                color: loading ? "var(--text-muted)" : "var(--canvas-bg)",
                opacity: !videoScript ? 0.4 : 1,
              }}
            >
              {loading ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
                  <circle cx="12" cy="12" r="10" strokeDasharray="60" strokeDashoffset="20" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M12 2L9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61z" />
                </svg>
              )}
            </button>
          </div>

          {error && <p className="text-xs px-2" style={{ color: "var(--ember)" }}>{error}</p>}

          {/* Selected axes summary */}
          {hasAxes && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: "rgba(110, 221, 179, 0.08)", border: "1px solid rgba(110, 221, 179, 0.2)" }}>
              <div className="flex-1 flex flex-wrap gap-1">
                {data.selectedAxes!.map((a, i) => (
                  <span key={i} className="px-2 py-0.5 rounded-full text-[10px] font-medium" style={{ background: "rgba(110, 221, 179, 0.15)", color: "var(--accent)" }}>
                    {a.title}
                  </span>
                ))}
              </div>
              <button onClick={clearAxes} className="flex-shrink-0 p-1 rounded-full nopan nodrag" style={{ color: "var(--ember)" }} title="Supprimer la sélection">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}

          {/* Suggestions toggle */}
          {suggestions.length > 0 && (
            <div>
              <button
                onClick={() => setShowSuggestions(!showSuggestions)}
                className="w-full flex items-center gap-2 px-2 py-1 text-[10px] nopan nodrag"
                style={{ color: "var(--text-muted)" }}
              >
                <svg
                  width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"
                  style={{ transform: showSuggestions ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.2s" }}
                >
                  <path d="M9 18l6-6-6-6" />
                </svg>
                {suggestions.length} propositions {checkedAxes.size > 0 && `(${checkedAxes.size} cochées)`}
              </button>

              {showSuggestions && (
                <div className="space-y-1.5 pt-1">
                  {suggestions.map((s, i) => {
                    const checked = checkedAxes.has(i);
                    return (
                      <div
                        key={i}
                        onClick={() => toggleAxis(i)}
                        className="w-full text-left px-3 py-2 rounded-xl transition-all nopan nodrag cursor-pointer flex gap-2"
                        style={{
                          background: checked ? "rgba(110, 221, 179, 0.1)" : "var(--surface)",
                          border: checked ? "1px solid var(--accent)" : "1px solid transparent",
                        }}
                      >
                        <input
                          type="checkbox" checked={checked} onChange={() => toggleAxis(i)}
                          className="mt-0.5 flex-shrink-0 nopan nodrag" style={{ accentColor: "var(--accent)" }}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-medium" style={{ color: checked ? "var(--accent)" : "var(--text-secondary)" }}>
                            {s.title}
                          </p>
                          {s.description && (
                            <p className="text-[10px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
                              {s.description}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {checkedAxes.size > 0 && (
                    <button
                      onClick={applySelectedAxes}
                      className="w-full py-2 rounded-xl text-xs font-medium transition-all nopan nodrag"
                      style={{ background: "var(--accent)", color: "var(--canvas-bg)" }}
                    >
                      {checkedAxes.size <= 1 ? "Utiliser cet axe" : `Utiliser ${checkedAxes.size} axes`}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <Handle type="source" position={Position.Right} id="prompt" />
      <div className="handle-label handle-label-right" style={{ top: "50%", right: -8, transform: "translateX(100%) translateY(-50%)" }}>
        <span style={{ color: "var(--accent)", fontSize: 10 }}>Prompt</span>
      </div>
    </NodeShell>
  );
}
