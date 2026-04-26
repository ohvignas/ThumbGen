"use client";

import { useState, useEffect } from "react";
import McpSettingsSection from "./settings/McpSettingsSection";
import { AGENT_MODELS } from "@/lib/agent/models";

type SettingsData = {
  geminiApiKey: string;
  ideogramApiKey: string;
  openaiApiKey: string;
  grokApiKey: string;
  anthropicApiKey: string;
  openrouterApiKey: string;
  youtubeApiKey: string;
  youtubePlaylistId: string;
  hasGemini: boolean;
  hasIdeogram: boolean;
  hasOpenai: boolean;
  hasGrok: boolean;
  hasAnthropic: boolean;
  hasOpenrouter: boolean;
  hasYoutube: boolean;
  language: string;
  agentModel: string;
  agentWebSearch: string;
};

export default function SettingsPanel({ onClose, onSaved }: { onClose: () => void; onSaved?: () => void }) {
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [gemini, setGemini] = useState("");
  const [ideogram, setIdeogram] = useState("");
  const [openai, setOpenai] = useState("");
  const [grok, setGrok] = useState("");
  const [anthropic, setAnthropic] = useState("");
  const [openrouter, setOpenrouter] = useState("");
  const [agentModel, setAgentModel] = useState("");
  const [agentWebSearch, setAgentWebSearch] = useState(true);
  const [ytKey, setYtKey] = useState("");
  const [ytPlaylist, setYtPlaylist] = useState("");
  const [language, setLanguage] = useState("fr");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((s: SettingsData) => {
        setSettings(s);
        setYtPlaylist(s.youtubePlaylistId || "");
        setLanguage(s.language || "fr");
        setAgentModel(s.agentModel || "");
        setAgentWebSearch((s.agentWebSearch ?? "1") !== "0");
      })
      .catch(() => {});
  }, []);

  const handleSave = async () => {
    setSaving(true);
    const body: Record<string, string> = {};
    // Only send fields that the user actually filled in
    if (gemini) body.geminiApiKey = gemini;
    if (ideogram) body.ideogramApiKey = ideogram;
    if (openai) body.openaiApiKey = openai;
    if (grok) body.grokApiKey = grok;
    if (anthropic) body.anthropicApiKey = anthropic;
    if (openrouter) body.openrouterApiKey = openrouter;
    if (agentModel) body.agentModel = agentModel;
    body.agentWebSearch = agentWebSearch ? "1" : "0";
    if (ytKey) body.youtubeApiKey = ytKey;
    body.youtubePlaylistId = ytPlaylist;
    body.language = language;

    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    setSaved(true);
    // Refresh settings display
    const res = await fetch("/api/settings");
    const data = await res.json();
    setSettings(data);
    setGemini("");
    setIdeogram("");
    setOpenai("");
    setGrok("");
    setAnthropic("");
    setYtKey("");
    onSaved?.();
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
          Réglages
        </h3>
        <button
          onClick={onClose}
          className="p-1 rounded-lg transition-all"
          style={{ color: "var(--text-muted)" }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Gemini */}
      <div className="mb-4">
        <label className="text-xs font-medium mb-1 block" style={{ color: "var(--text-secondary)" }}>
          Clé API Google Gemini
        </label>
        <div className="flex items-center gap-2 mb-1">
          <div
            className="w-2 h-2 rounded-full"
            style={{ background: settings?.hasGemini ? "var(--accent)" : "var(--bone-faint)" }}
          />
          <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
            {settings?.hasGemini ? `Connecté (${settings.geminiApiKey})` : "Non configuré"}
          </span>
        </div>
        <input
          type="password"
          placeholder="AIzaSy..."
          value={gemini}
          onChange={(e) => setGemini(e.target.value)}
          className="w-full px-3 py-2 rounded-lg text-xs focus:outline-none"
          style={{
            background: "var(--surface)",
            color: "var(--text-secondary)",
            border: "1px solid transparent",
          }}
        />
        <a
          href="https://aistudio.google.com/apikey"
          target="_blank"
          rel="noopener"
          className="text-[10px] mt-1 block"
          style={{ color: "var(--accent)" }}
        >
          Obtenir une clé gratuite →
        </a>
      </div>

      {/* Ideogram */}
      <div className="mb-4">
        <label className="text-xs font-medium mb-1 block" style={{ color: "var(--text-secondary)" }}>
          Clé API Ideogram
        </label>
        <div className="flex items-center gap-2 mb-1">
          <div
            className="w-2 h-2 rounded-full"
            style={{ background: settings?.hasIdeogram ? "var(--accent)" : "var(--bone-faint)" }}
          />
          <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
            {settings?.hasIdeogram ? `Connecté (${settings.ideogramApiKey})` : "Non configuré"}
          </span>
        </div>
        <input
          type="password"
          placeholder="ide_..."
          value={ideogram}
          onChange={(e) => setIdeogram(e.target.value)}
          className="w-full px-3 py-2 rounded-lg text-xs focus:outline-none"
          style={{
            background: "var(--surface)",
            color: "var(--text-secondary)",
            border: "1px solid transparent",
          }}
        />
        <a
          href="https://ideogram.ai/manage-api"
          target="_blank"
          rel="noopener"
          className="text-[10px] mt-1 block"
          style={{ color: "var(--accent)" }}
        >
          Obtenir une clé →
        </a>
      </div>

      {/* OpenAI */}
      <div className="mb-4">
        <label className="text-xs font-medium mb-1 block" style={{ color: "var(--text-secondary)" }}>
          Clé API OpenAI
        </label>
        <div className="flex items-center gap-2 mb-1">
          <div
            className="w-2 h-2 rounded-full"
            style={{ background: settings?.hasOpenai ? "var(--accent)" : "var(--bone-faint)" }}
          />
          <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
            {settings?.hasOpenai ? `Connecté (${settings?.openaiApiKey})` : "Non configuré"}
          </span>
        </div>
        <input
          type="password"
          placeholder="sk-..."
          value={openai}
          onChange={(e) => setOpenai(e.target.value)}
          className="w-full px-3 py-2 rounded-lg text-xs focus:outline-none"
          style={{
            background: "var(--surface)",
            color: "var(--text-secondary)",
            border: "1px solid transparent",
          }}
        />
        <a
          href="https://platform.openai.com/api-keys"
          target="_blank"
          rel="noopener"
          className="text-[10px] mt-1 block"
          style={{ color: "var(--accent)" }}
        >
          Obtenir une clé →
        </a>
      </div>

      {/* Grok */}
      <div className="mb-4">
        <label className="text-xs font-medium mb-1 block" style={{ color: "var(--text-secondary)" }}>
          Clé API Grok (xAI)
        </label>
        <div className="flex items-center gap-2 mb-1">
          <div
            className="w-2 h-2 rounded-full"
            style={{ background: settings?.hasGrok ? "var(--accent)" : "var(--bone-faint)" }}
          />
          <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
            {settings?.hasGrok ? `Connecté (${settings?.grokApiKey})` : "Non configuré"}
          </span>
        </div>
        <input
          type="password"
          placeholder="xai-..."
          value={grok}
          onChange={(e) => setGrok(e.target.value)}
          className="w-full px-3 py-2 rounded-lg text-xs focus:outline-none"
          style={{
            background: "var(--surface)",
            color: "var(--text-secondary)",
            border: "1px solid transparent",
          }}
        />
        <a
          href="https://console.x.ai"
          target="_blank"
          rel="noopener"
          className="text-[10px] mt-1 block"
          style={{ color: "var(--accent)" }}
        >
          Obtenir une clé →
        </a>
      </div>

      {/* OpenRouter — agent model gateway */}
      <div className="mb-4">
        <label className="text-xs font-medium mb-1 block" style={{ color: "var(--text-secondary)" }}>
          Clé OpenRouter <span style={{ color: "var(--brand)" }}>·</span> agent IA
        </label>
        <div className="flex items-center gap-2 mb-1">
          <div
            className="w-2 h-2 rounded-full"
            style={{ background: settings?.hasOpenrouter ? "var(--accent)" : "var(--bone-faint)" }}
          />
          <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
            {settings?.hasOpenrouter ? `Connecté (${settings?.openrouterApiKey})` : "Non configuré"}
          </span>
        </div>
        <input
          type="password"
          placeholder="sk-or-v1-..."
          value={openrouter}
          onChange={(e) => setOpenrouter(e.target.value)}
          className="w-full px-3 py-2 rounded-lg text-xs focus:outline-none"
          style={{
            background: "var(--surface)",
            color: "var(--text-secondary)",
            border: "1px solid transparent",
          }}
        />
        <a
          href="https://openrouter.ai/keys"
          target="_blank"
          rel="noopener"
          className="text-[10px] mt-1 block"
          style={{ color: "var(--accent)" }}
        >
          Obtenir une clé →
        </a>

        {/* Model picker */}
        <label className="text-xs font-medium mt-3 mb-1 block" style={{ color: "var(--text-secondary)" }}>
          Modèle de l&apos;agent
        </label>
        <select
          value={agentModel || settings?.agentModel || "google/gemini-3.1-pro-preview"}
          onChange={(e) => setAgentModel(e.target.value)}
          className="w-full px-3 py-2 rounded-lg text-xs focus:outline-none"
          style={{
            background: "var(--surface)",
            color: "var(--text-secondary)",
            border: "1px solid transparent",
          }}
        >
          {AGENT_MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label} — ${m.pricing.inputPerM}/${m.pricing.outputPerM} per M
            </option>
          ))}
        </select>

        {/* Web search toggle */}
        <label className="flex items-center gap-2 mt-3 text-xs" style={{ color: "var(--text-secondary)" }}>
          <input
            type="checkbox"
            checked={agentWebSearch}
            onChange={(e) => setAgentWebSearch(e.target.checked)}
          />
          Recherche web automatique (variant :online)
        </label>
      </div>

      {/* Anthropic — needed by the chat agent */}
      <div className="mb-4">
        <label className="text-xs font-medium mb-1 block" style={{ color: "var(--text-secondary)" }}>
          Clé API Anthropic <span style={{ color: "var(--brand)" }}>·</span> chat IA
        </label>
        <div className="flex items-center gap-2 mb-1">
          <div
            className="w-2 h-2 rounded-full"
            style={{ background: settings?.hasAnthropic ? "var(--accent)" : "var(--bone-faint)" }}
          />
          <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
            {settings?.hasAnthropic ? `Connecté (${settings?.anthropicApiKey})` : "Non configuré"}
          </span>
        </div>
        <input
          type="password"
          placeholder="sk-ant-..."
          value={anthropic}
          onChange={(e) => setAnthropic(e.target.value)}
          className="w-full px-3 py-2 rounded-lg text-xs focus:outline-none"
          style={{
            background: "var(--surface)",
            color: "var(--text-secondary)",
            border: "1px solid transparent",
          }}
        />
        <a
          href="https://console.anthropic.com/settings/keys"
          target="_blank"
          rel="noopener"
          className="text-[10px] mt-1 block"
          style={{ color: "var(--accent)" }}
        >
          Obtenir une clé →
        </a>
      </div>

      {/* YouTube */}
      <div className="mb-4">
        <label className="text-xs font-medium mb-1 block" style={{ color: "var(--text-secondary)" }}>
          Clé API YouTube
        </label>
        <div className="flex items-center gap-2 mb-1">
          <div
            className="w-2 h-2 rounded-full"
            style={{ background: settings?.hasYoutube ? "var(--accent)" : "var(--bone-faint)" }}
          />
          <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
            {settings?.hasYoutube ? `Connecté (${settings.youtubeApiKey})` : "Non configuré"}
          </span>
        </div>
        <input
          type="password"
          placeholder="AIzaSy..."
          value={ytKey}
          onChange={(e) => setYtKey(e.target.value)}
          className="w-full px-3 py-2 rounded-lg text-xs focus:outline-none"
          style={{
            background: "var(--surface)",
            color: "var(--text-secondary)",
            border: "1px solid transparent",
          }}
        />
        <a
          href="https://console.cloud.google.com/apis/credentials"
          target="_blank"
          rel="noopener"
          className="text-[10px] mt-1 block"
          style={{ color: "var(--accent)" }}
        >
          Obtenir une clé →
        </a>
      </div>

      {/* YouTube Channel */}
      <div className="mb-5">
        <label className="text-xs font-medium mb-1 block" style={{ color: "var(--text-secondary)" }}>
          Chaîne YouTube
        </label>
        <input
          type="text"
          placeholder="https://youtube.com/@votrechaine"
          value={ytPlaylist}
          onChange={(e) => setYtPlaylist(e.target.value)}
          className="w-full px-3 py-2 rounded-lg text-xs focus:outline-none"
          style={{
            background: "var(--surface)",
            color: "var(--text-secondary)",
            border: "1px solid transparent",
          }}
        />
        <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>
          Colle l&apos;URL de ta chaîne YouTube ou un ID de playlist
        </p>
      </div>

      {/* Language */}
      <div className="mb-5">
        <label className="text-xs font-medium mb-1 block" style={{ color: "var(--text-secondary)" }}>
          Langue par défaut
        </label>
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          className="w-full px-3 py-2 rounded-lg text-xs focus:outline-none"
          style={{
            background: "var(--surface)",
            color: "var(--text-secondary)",
            border: "1px solid transparent",
          }}
        >
          <option value="fr">Français</option>
          <option value="en">English</option>
          <option value="es">Español</option>
          <option value="de">Deutsch</option>
          <option value="pt">Português</option>
          <option value="it">Italiano</option>
        </select>
        <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>
          Le texte sur les miniatures sera généré dans cette langue
        </p>
      </div>

      {/* MCP */}
      <div className="mb-5">
        <hr className="mb-4" style={{ borderColor: "var(--bone-faint)" }} />
        <McpSettingsSection />
      </div>

      {/* Save */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full py-2 rounded-lg text-xs font-medium transition-all"
        style={{
          background: saved ? "var(--accent)" : "var(--bone)",
          color: "var(--canvas-bg)",
          opacity: saving ? 0.5 : 1,
        }}
      >
        {saving ? "Enregistrement…" : saved ? "Enregistré !" : "Enregistrer"}
      </button>
    </div>
  );
}
