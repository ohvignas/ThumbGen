"use client";

import { Handle, Position, NodeProps } from "@xyflow/react";
import { useCanvasStore, AppNode } from "@/store/canvas-store";
import { useCallback, useState, useEffect } from "react";
import NodeShell from "./NodeShell";
import { MODEL_COSTS, INPUT_TYPE_COLORS } from "@/lib/model-costs";

const GEMINI_MODELS = [
  { id: "gemini-3-pro-image-preview", label: "Gemini 3 Pro", provider: "gemini" },
  { id: "gemini-3.1-flash-image-preview", label: "Gemini 3.1 Flash", provider: "gemini" },
  { id: "gemini-2.5-flash-image", label: "Gemini 2.5 Flash", provider: "gemini" },
];

const IDEOGRAM_MODELS = [
  { id: "ideogram", label: "Ideogram v3", provider: "ideogram" },
];

const OPENAI_MODELS = [
  { id: "gpt-image-2", label: "GPT Image 2 (4K)", provider: "openai" },
  { id: "gpt-image-1.5", label: "GPT Image 1.5", provider: "openai" },
  { id: "gpt-image-1", label: "GPT Image 1", provider: "openai" },
];

const GROK_MODELS = [
  { id: "grok-imagine-image", label: "Grok Imagine", provider: "grok" },
];

const ALL_MODELS = [...GEMINI_MODELS, ...IDEOGRAM_MODELS, ...OPENAI_MODELS, ...GROK_MODELS];

function getModelLabel(modelId: string): string {
  return ALL_MODELS.find((m) => m.id === modelId)?.label || modelId;
}

function getProvider(modelId: string): string {
  return ALL_MODELS.find((m) => m.id === modelId)?.provider || "gemini";
}

export default function GeneratorNode({
  id,
  data,
  positionAbsoluteX,
  positionAbsoluteY,
}: NodeProps<AppNode>) {
  const { updateNodeData, removeNode, getConnectedInputs, addNode, addNodeAndConnect } =
    useCanvasStore();
  const [error, setError] = useState<string | null>(null);
  const [compareModels, setCompareModels] = useState<Set<string>>(new Set());
  const [comparing, setComparing] = useState(false);
  const [availableProviders, setAvailableProviders] = useState<Record<string, boolean>>({ gemini: true });

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((s) => {
        setAvailableProviders({
          gemini: !!s.hasGemini,
          ideogram: !!s.hasIdeogram,
          openai: !!s.hasOpenai,
          grok: !!s.hasGrok,
        });
      })
      .catch(() => {});
  }, []);

  const model = data.model || "gemini-3-pro-image-preview";
  const aspectRatio = data.aspectRatio || "16x9";
  const renderingSpeed = data.renderingSpeed || "DEFAULT";
  const numImages = data.numImages || 1;
  const ideogramMode = data.ideogramMode || "generate";
  const provider = getProvider(model);

  const iconColor = provider === "ideogram" ? INPUT_TYPE_COLORS.ideogram : "var(--accent)";
  const modelIcon = (
    <svg width="16" height="16" viewBox="0 0 24 24" fill={iconColor} strokeWidth="0">
      <path d="M12 2L9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61z" />
    </svg>
  );

  // Collect inputs from connected nodes
  const collectInputs = useCallback(async () => {
    const inputs = getConnectedInputs(id);

    const getImage = async (n: { data: { imageBase64?: string; imageUrl?: string } }): Promise<string | null> => {
      if (n.data.imageBase64) return n.data.imageBase64;
      if (n.data.imageUrl) {
        try {
          const res = await fetch(n.data.imageUrl);
          const blob = await res.blob();
          return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(blob);
          });
        } catch { return null; }
      }
      return null;
    };

    const faceImages = (await Promise.all(inputs.faceRefs.map(getImage))).filter(Boolean) as string[];
    const swipeImages = (await Promise.all(inputs.swipeRefs.map(getImage))).filter(Boolean) as string[];
    const logoResults = await Promise.all(
      inputs.logos.map(async (n) => {
        const img = await getImage(n);
        return img ? { image: img, label: n.data.label || n.data.prompt || "Logo" } : null;
      })
    );
    const logoEntries = logoResults.filter(Boolean) as { image: string; label: string }[];
    const promptText = inputs.prompts.map((n) => n.data.prompt).filter(Boolean).join("\n");
    const negativePrompt = inputs.prompts.map((n) => n.data.negativePrompt).filter(Boolean).join("\n");
    // Convert preview images (URLs) to base64
    const previewImageUrls = inputs.images
      .filter((n) => n.type === "preview")
      .map((n) => {
        const imgs = n.data.generatedImages;
        const idx = n.data.selectedImageIndex || 0;
        return imgs?.[idx];
      })
      .filter(Boolean) as string[];

    const previewImages = (await Promise.all(
      previewImageUrls.map(async (url) => {
        if (url.startsWith("data:")) return url;
        try {
          const res = await fetch(url);
          const blob = await res.blob();
          return new Promise<string | null>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(blob);
          });
        } catch { return null; }
      })
    )).filter(Boolean) as string[];
    const allRefImages = [...swipeImages, ...previewImages];
    const sketchImages = (await Promise.all(inputs.sketches.map(getImage))).filter(Boolean) as string[];

    return { faceImages, allRefImages, logoEntries, sketchImages, promptText, negativePrompt };
  }, [id, getConnectedInputs]);

  // Generate with a specific model
  const generateWithModel = useCallback(async (targetModel: string, inputs: Awaited<ReturnType<typeof collectInputs>>) => {
    const targetProvider = getProvider(targetModel);
    let endpoint: string;
    let body: Record<string, unknown>;

    if (targetProvider === "gemini") {
      endpoint = "/api/generate/nano-banana";
      body = {
        prompt: inputs.promptText,
        negativePrompt: inputs.negativePrompt,
        faceImages: inputs.faceImages,
        referenceImages: inputs.allRefImages,
        logos: inputs.logoEntries,
        sketchImages: inputs.sketchImages,
        aspectRatio,
        model: targetModel,
      };
    } else if (targetProvider === "ideogram") {
      if (ideogramMode === "remix" && inputs.allRefImages.length > 0) {
        endpoint = "/api/remix/ideogram";
        body = {
          prompt: inputs.promptText,
          negativePrompt: inputs.negativePrompt,
          image: inputs.allRefImages[0],
          imageWeight: data.imageWeight ?? 50,
          characterReferenceImage: inputs.faceImages[0] || null,
          styleReferenceImages: inputs.allRefImages.slice(1),
          aspectRatio,
          renderingSpeed,
          styleType: data.styleType || "GENERAL",
        };
      } else if (ideogramMode === "edit" && inputs.allRefImages.length > 0) {
        endpoint = "/api/edit/ideogram";
        body = {
          prompt: inputs.promptText,
          image: inputs.allRefImages[0],
          mask: data.maskDataUrl || null,
          characterReferenceImage: inputs.faceImages[0] || null,
          renderingSpeed,
          styleType: data.styleType || "GENERAL",
        };
      } else {
        endpoint = "/api/generate/ideogram";
        body = {
          prompt: inputs.promptText,
          negativePrompt: inputs.negativePrompt,
          characterReferenceImage: inputs.faceImages[0] || null,
          styleReferenceImages: inputs.allRefImages,
          aspectRatio,
          renderingSpeed,
          styleType: data.styleType || "GENERAL",
        };
      }
    } else {
      endpoint = `/api/generate/${targetProvider}`;
      body = {
        prompt: inputs.promptText,
        negativePrompt: inputs.negativePrompt,
        faceImages: inputs.faceImages,
        referenceImages: inputs.allRefImages,
        logos: inputs.logoEntries,
        sketchImages: inputs.sketchImages,
        aspectRatio,
        model: targetModel,
      };
    }

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `Échec de la génération (${res.status})`);
    }

    const result = await res.json();
    return {
      images: result.images || [],
      stats: result.stats || null,
    };
  }, [aspectRatio, renderingSpeed, ideogramMode, data.imageWeight, data.maskDataUrl, data.styleType]);

  // Single model generation — progressive
  const handleGenerate = useCallback(async () => {
    setError(null);
    updateNodeData(id, { isGenerating: true });

    try {
      const inputs = await collectInputs();
      const modelLabel = getModelLabel(model);

      // Step 1: Create all preview nodes in "loading" state
      const allJobs: { previewId: string }[] = [];
      let xOffset = 0;
      for (let ni = 0; ni < numImages; ni++) {
        const suffix = numImages > 1 ? ` #${ni + 1}` : "";
        const label = `${modelLabel}${suffix}`;
        const previewId = addNodeAndConnect(
          "preview",
          { x: positionAbsoluteX + 360 + xOffset, y: positionAbsoluteY },
          id, "result", "preview-in",
          { label, genStatus: "loading", genModel: modelLabel, genPromptUsed: inputs.promptText },
          true,
        );
        allJobs.push({ previewId });
        xOffset += 350;
      }

      // Step 2: Generate all in parallel
      const promises = allJobs.map(async (job) => {
        const start = Date.now();
        try {
          const result = await generateWithModel(model, inputs);
          const elapsed = Date.now() - start;
          const cost = MODEL_COSTS[model] || 0;
          updateNodeData(job.previewId, {
            generatedImages: result.images,
            selectedImageIndex: 0,
            genStatus: "done",
            genTimeMs: elapsed,
            genTokens: result.stats?.totalTokens || 0,
            genCost: cost > 0 ? `~$${(cost).toFixed(3)}` : "",
          });
        } catch (err) {
          updateNodeData(job.previewId, {
            genStatus: "error",
            genError: err instanceof Error ? err.message : "Échec de la génération",
            genTimeMs: Date.now() - start,
          });
        }
      });

      await Promise.allSettled(promises);
      updateNodeData(id, { isGenerating: false });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Échec de la génération";
      setError(message);
      updateNodeData(id, { isGenerating: false });
    }
  }, [id, model, numImages, collectInputs, generateWithModel, updateNodeData, addNodeAndConnect, positionAbsoluteX, positionAbsoluteY]);

  // Compare: axes × models — progressive
  const handleCompare = useCallback(async () => {
    if (compareModels.size < 1) return;
    setError(null);
    setComparing(true);
    updateNodeData(id, { isGenerating: true });

    try {
      const inputs = await collectInputs();
      const allModels = Array.from(new Set([model, ...compareModels]));

      // Step 1: Create ALL preview nodes (models × numImages)
      const allJobs: { previewId: string; targetModel: string }[] = [];
      let xOffset = 0;
      for (const m of allModels) {
        const mLabel = getModelLabel(m);
        for (let ni = 0; ni < numImages; ni++) {
          const suffix = numImages > 1 ? ` #${ni + 1}` : "";
          const label = `${mLabel}${suffix}`;
          const previewId = addNodeAndConnect(
            "preview",
            { x: positionAbsoluteX + 360 + xOffset, y: positionAbsoluteY },
            id, "result", "preview-in",
            { label, genStatus: "loading", genModel: mLabel, genPromptUsed: inputs.promptText },
            true,
          );
          allJobs.push({ previewId, targetModel: m });
          xOffset += 350;
        }
      }

      // Step 2: Generate all in parallel
      const allPromises = allJobs.map((job) => (async () => {
        const start = Date.now();
        try {
          const result = await generateWithModel(job.targetModel, inputs);
          const cost = MODEL_COSTS[job.targetModel] || 0;
          updateNodeData(job.previewId, {
            generatedImages: result.images,
            selectedImageIndex: 0,
            genStatus: "done",
            genTimeMs: Date.now() - start,
            genTokens: result.stats?.totalTokens || 0,
            genCost: cost > 0 ? `~$${cost.toFixed(3)}` : "",
          });
        } catch (err) {
          updateNodeData(job.previewId, {
            genStatus: "error",
            genError: err instanceof Error ? err.message : "Échec",
            genTimeMs: Date.now() - start,
          });
        }
      })());

      await Promise.allSettled(allPromises);
      updateNodeData(id, { isGenerating: false });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Échec de la comparaison";
      setError(message);
      updateNodeData(id, { isGenerating: false });
    } finally {
      setComparing(false);
    }
  }, [id, model, numImages, compareModels, collectInputs, generateWithModel, updateNodeData, addNodeAndConnect, positionAbsoluteX, positionAbsoluteY]);

  const toggleCompareModel = (modelId: string) => {
    setCompareModels((prev) => {
      const next = new Set(prev);
      if (next.has(modelId)) next.delete(modelId);
      else next.add(modelId);
      return next;
    });
  };

  const selectStyle = {
    background: "var(--surface)",
    color: "var(--text-secondary)",
    border: "1px solid transparent",
  };

  return (
    <NodeShell
      title="Générateur"
      icon={modelIcon}
      onDelete={() => removeNode(id)}
      width={320}
    >
      {/* Prompt handle */}
      <Handle type="target" position={Position.Left} id="prompt-in" style={{ top: "8%" }} />
      <button
        className="absolute nopan nodrag text-xs cursor-pointer transition-colors"
        style={{ left: -8, top: "8%", transform: "translateX(-100%) translateY(-50%)", color: INPUT_TYPE_COLORS.prompt, background: "none", border: "none", padding: "2px 4px" }}
        onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.7")}
        onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
        onClick={() => addNodeAndConnect("prompt", { x: positionAbsoluteX - 340, y: positionAbsoluteY - 100 }, id, "prompt-in", "prompt")}
      >
        Prompt
      </button>

      {/* Face handle */}
      <Handle type="target" position={Position.Left} id="face-in" style={{ top: "14%" }} />
      <button
        className="absolute nopan nodrag text-xs cursor-pointer transition-colors"
        style={{ left: -8, top: "14%", transform: "translateX(-100%) translateY(-50%)", color: INPUT_TYPE_COLORS.face, background: "none", border: "none", padding: "2px 4px" }}
        onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.7")}
        onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
        onClick={() => addNodeAndConnect("faceReference", { x: positionAbsoluteX - 340, y: positionAbsoluteY + 50 }, id, "face-in", "face")}
      >
        Visage
      </button>

      {/* Reference handle */}
      <Handle type="target" position={Position.Left} id="ref-in" style={{ top: "20%" }} />
      <button
        className="absolute nopan nodrag text-xs cursor-pointer transition-colors"
        style={{ left: -8, top: "20%", transform: "translateX(-100%) translateY(-50%)", color: "var(--accent)", background: "none", border: "none", padding: "2px 4px" }}
        onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.7")}
        onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
        onClick={() => addNodeAndConnect("swipeFile", { x: positionAbsoluteX - 340, y: positionAbsoluteY + 200 }, id, "ref-in", "image")}
      >
        Référence
      </button>

      {/* Logo handle */}
      <Handle type="target" position={Position.Left} id="logo-in" style={{ top: "26%" }} />
      <button
        className="absolute nopan nodrag text-xs cursor-pointer transition-colors"
        style={{ left: -8, top: "26%", transform: "translateX(-100%) translateY(-50%)", color: INPUT_TYPE_COLORS.logo, background: "none", border: "none", padding: "2px 4px" }}
        onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.7")}
        onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
        onClick={() => addNodeAndConnect("swipeFile", { x: positionAbsoluteX - 340, y: positionAbsoluteY + 350 }, id, "logo-in", "image")}
      >
        Logo
      </button>

      {/* Sketch handle */}
      <Handle type="target" position={Position.Left} id="sketch-in" style={{ top: "32%" }} />
      <button
        className="absolute nopan nodrag text-xs cursor-pointer transition-colors"
        style={{ left: -8, top: "32%", transform: "translateX(-100%) translateY(-50%)", color: INPUT_TYPE_COLORS.sketch, background: "none", border: "none", padding: "2px 4px" }}
        onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.7")}
        onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
        onClick={() => addNodeAndConnect("sketch", { x: positionAbsoluteX - 340, y: positionAbsoluteY + 500 }, id, "sketch-in", "image")}
      >
        Croquis
      </button>

      {/* Generated image preview */}
      {data.generatedImages && data.generatedImages.length > 0 && (
        <div className="mb-4 rounded-xl overflow-hidden">
          <img
            src={data.generatedImages[data.selectedImageIndex || 0]}
            alt="Miniature générée"
            className="w-full"
          />
        </div>
      )}

      {/* Settings */}
      <div className="space-y-3">
        <div>
          <label className="text-xs block mb-1.5" style={{ color: "var(--text-muted)" }}>
            Modèle
          </label>
          <div className="flex gap-1">
          <select
            value={model}
            onChange={(e) => {
              const selected = e.target.value;
              const prov = getProvider(selected);
              if (availableProviders[prov]) {
                updateNodeData(id, { model: selected });
              }
            }}
            className="flex-1 rounded-xl px-3 py-2 text-xs focus:outline-none nopan nodrag"
            style={selectStyle}
          >
            <optgroup label="Gemini">
              {GEMINI_MODELS.map((m) => (
                <option key={m.id} value={m.id} disabled={!availableProviders[m.provider]}>
                  {m.label}{!availableProviders[m.provider] ? " (inactif)" : ""}
                </option>
              ))}
            </optgroup>
            <optgroup label="Ideogram">
              {IDEOGRAM_MODELS.map((m) => (
                <option key={m.id} value={m.id} disabled={!availableProviders[m.provider]}>
                  {m.label}{!availableProviders[m.provider] ? " (inactif)" : ""}
                </option>
              ))}
            </optgroup>
            <optgroup label="OpenAI">
              {OPENAI_MODELS.map((m) => (
                <option key={m.id} value={m.id} disabled={!availableProviders[m.provider]}>
                  {m.label}{!availableProviders[m.provider] ? " (inactif)" : ""}
                </option>
              ))}
            </optgroup>
            <optgroup label="Grok (xAI)">
              {GROK_MODELS.map((m) => (
                <option key={m.id} value={m.id} disabled={!availableProviders[m.provider]}>
                  {m.label}{!availableProviders[m.provider] ? " (inactif)" : ""}
                </option>
              ))}
            </optgroup>
          </select>
          <button
            onClick={() => {
              fetch("/api/settings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ favoriteModel: model }),
              });
            }}
            className="px-2 rounded-xl nopan nodrag transition-all flex-shrink-0"
            style={{
              background: "var(--surface)",
              color: "var(--accent-yellow)",
            }}
            title="Définir comme modèle par défaut"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" strokeWidth="0">
              <path d="M12 2L9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61z" />
            </svg>
          </button>
          </div>
        </div>

        {provider === "ideogram" && (
          <div>
            <label className="text-xs block mb-1.5" style={{ color: "var(--text-muted)" }}>Mode</label>
            <select
              value={ideogramMode}
              onChange={(e) => updateNodeData(id, { ideogramMode: e.target.value as "generate" | "remix" | "edit" })}
              className="w-full rounded-xl px-3 py-2 text-sm focus:outline-none nopan nodrag"
              style={selectStyle}
            >
              <option value="generate">Générer</option>
              <option value="remix">Remix</option>
              <option value="edit">Éditer (Inpaint)</option>
            </select>
          </div>
        )}

        <div>
          <label className="text-xs block mb-1.5" style={{ color: "var(--text-muted)" }}>Format</label>
          <select
            value={aspectRatio}
            onChange={(e) => updateNodeData(id, { aspectRatio: e.target.value })}
            className="w-full rounded-xl px-3 py-2 text-sm focus:outline-none nopan nodrag"
            style={selectStyle}
          >
            <option value="16x9">16:9 (Miniature)</option>
            <option value="1x1">1:1 (Carré)</option>
            <option value="4x3">4:3</option>
            <option value="3x2">3:2</option>
            <option value="9x16">9:16 (Vertical)</option>
          </select>
        </div>

        <div>
          <label className="text-xs block mb-1.5" style={{ color: "var(--text-muted)" }}>Images par modèle</label>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                onClick={() => updateNodeData(id, { numImages: n })}
                className="flex-1 py-1.5 rounded-lg text-xs font-medium transition-all nopan nodrag"
                style={{
                  background: (data.numImages || 1) === n ? "var(--accent)" : "var(--surface)",
                  color: (data.numImages || 1) === n ? "var(--canvas-bg)" : "var(--text-muted)",
                }}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {provider === "ideogram" && (
          <>
            <div>
              <label className="text-xs block mb-1.5" style={{ color: "var(--text-muted)" }}>Vitesse</label>
              <select value={renderingSpeed} onChange={(e) => updateNodeData(id, { renderingSpeed: e.target.value })} className="w-full rounded-xl px-3 py-2 text-sm focus:outline-none nopan nodrag" style={selectStyle}>
                <option value="TURBO">Turbo</option>
                <option value="DEFAULT">Default</option>
                <option value="QUALITY">Quality</option>
              </select>
            </div>
            <div>
              <label className="text-xs block mb-1.5" style={{ color: "var(--text-muted)" }}>Style</label>
              <select value={data.styleType || "GENERAL"} onChange={(e) => updateNodeData(id, { styleType: e.target.value })} className="w-full rounded-xl px-3 py-2 text-sm focus:outline-none nopan nodrag" style={selectStyle}>
                <option value="AUTO">Auto</option>
                <option value="GENERAL">General</option>
                <option value="REALISTIC">Realistic</option>
                <option value="DESIGN">Design</option>
                <option value="FICTION">Fiction</option>
              </select>
            </div>
            {ideogramMode === "remix" && (
              <div>
                <label className="text-xs block mb-1.5" style={{ color: "var(--text-muted)" }}>Poids de l&apos;image : {data.imageWeight ?? 50}%</label>
                <input type="range" min={0} max={100} value={data.imageWeight ?? 50} onChange={(e) => updateNodeData(id, { imageWeight: Number(e.target.value) })} className="w-full nopan nodrag" style={{ accentColor: "var(--accent)" }} />
              </div>
            )}
          </>
        )}

        {/* Compare — optional other models */}
        <div className="pt-2" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <label className="text-xs block mb-2" style={{ color: "var(--text-muted)" }}>
            Comparer avec d'autres modèles (optionnel)
          </label>
          <div className="space-y-1 mb-3">
            {ALL_MODELS.filter((m) => m.id !== model).map((m) => {
              const isAvailable = !!availableProviders[m.provider];
              return (
                <label
                  key={m.id}
                  className="flex items-center gap-2 px-2 py-1 rounded-lg text-xs transition-all nopan nodrag"
                  style={{
                    color: !isAvailable ? "var(--text-muted)" : compareModels.has(m.id) ? "var(--text-primary)" : "var(--text-muted)",
                    background: compareModels.has(m.id) && isAvailable ? "var(--surface)" : "transparent",
                    opacity: isAvailable ? 1 : 0.4,
                    cursor: isAvailable ? "pointer" : "not-allowed",
                  }}
                  title={!isAvailable ? "Clé API non configurée — va dans Réglages" : ""}
                >
                  <input
                    type="checkbox"
                    checked={compareModels.has(m.id)}
                    onChange={() => isAvailable && toggleCompareModel(m.id)}
                    disabled={!isAvailable}
                    className="nopan nodrag"
                    style={{ accentColor: "var(--accent)" }}
                  />
                  {m.label}
                  {!isAvailable && <span style={{ color: "var(--bone-faint)", fontSize: 10 }}>(inactif)</span>}
                </label>
              );
            })}
          </div>
        </div>

        {/* Single generate button — runs with compare if any checked */}
        <button
          onClick={compareModels.size > 0 ? handleCompare : handleGenerate}
          disabled={data.isGenerating}
          className="w-full px-4 py-2.5 rounded-xl text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          style={{ background: "var(--accent-yellow)", color: "var(--canvas-bg)" }}
        >
          {data.isGenerating ? (
            <>
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
              Génération en cours…
            </>
          ) : (() => {
            const totalModels = compareModels.size > 0 ? compareModels.size + 1 : 1;
            const totalImages = totalModels * numImages;
            if (totalImages === 1) return <>&rarr; Générer</>;
            if (compareModels.size > 0) return <>&rarr; Générer {totalImages} images ({totalModels} modèles × {numImages})</>;
            return <>&rarr; Générer {numImages} images</>;
          })()}
        </button>

        {error && (
          <p className="text-xs" style={{ color: "var(--ember)" }}>{error}</p>
        )}
      </div>

      <Handle type="source" position={Position.Right} id="result" />
      <span className="absolute text-xs pointer-events-none" style={{ right: -8, top: "15%", transform: "translateX(100%) translateY(-50%)", color: "var(--accent)" }}>
        Résultat
      </span>
    </NodeShell>
  );
}
