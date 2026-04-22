"use client";

import { useState, useEffect } from "react";

type SettingsData = {
  geminiApiKey: string;
  ideogramApiKey: string;
  openaiApiKey: string;
  grokApiKey: string;
  youtubeApiKey: string;
  youtubePlaylistId: string;
  hasGemini: boolean;
  hasIdeogram: boolean;
  hasOpenai: boolean;
  hasGrok: boolean;
  hasYoutube: boolean;
  language: string;
};

export default function SettingsPanel({ onClose, onSaved }: { onClose: () => void; onSaved?: () => void }) {
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [gemini, setGemini] = useState("");
  const [ideogram, setIdeogram] = useState("");
  const [openai, setOpenai] = useState("");
  const [grok, setGrok] = useState("");
  const [ytKey, setYtKey] = useState("");
  const [ytPlaylist, setYtPlaylist] = useState("");
  const [language, setLanguage] = useState("fr");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data: SettingsData) => {
        setSettings(data);
        setYtPlaylist(data.youtubePlaylistId || "");
        setLanguage(data.language || "fr");
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
    setYtKey("");
    onSaved?.();
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
          Settings
        </h3>
        <button
          onClick={onClose}
          className="p-1 rounded-lg transition-all"
          style={{ color: "var(--text-muted)" }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Gemini */}
      <div className="mb-4">
        <label className="text-xs font-medium mb-1 block" style={{ color: "var(--text-secondary)" }}>
          Google Gemini API Key
        </label>
        <div className="flex items-center gap-2 mb-1">
          <div
            className="w-2 h-2 rounded-full"
            style={{ background: settings?.hasGemini ? "#4ade80" : "#666" }}
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
          Ideogram API Key
        </label>
        <div className="flex items-center gap-2 mb-1">
          <div
            className="w-2 h-2 rounded-full"
            style={{ background: settings?.hasIdeogram ? "#4ade80" : "#666" }}
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
          OpenAI API Key
        </label>
        <div className="flex items-center gap-2 mb-1">
          <div
            className="w-2 h-2 rounded-full"
            style={{ background: settings?.hasOpenai ? "#4ade80" : "#666" }}
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
          OpenAI API Keys →
        </a>
      </div>

      {/* Grok */}
      <div className="mb-4">
        <label className="text-xs font-medium mb-1 block" style={{ color: "var(--text-secondary)" }}>
          Grok (xAI) API Key
        </label>
        <div className="flex items-center gap-2 mb-1">
          <div
            className="w-2 h-2 rounded-full"
            style={{ background: settings?.hasGrok ? "#4ade80" : "#666" }}
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
          xAI Console →
        </a>
      </div>

      {/* YouTube */}
      <div className="mb-4">
        <label className="text-xs font-medium mb-1 block" style={{ color: "var(--text-secondary)" }}>
          YouTube API Key
        </label>
        <div className="flex items-center gap-2 mb-1">
          <div
            className="w-2 h-2 rounded-full"
            style={{ background: settings?.hasYoutube ? "#4ade80" : "#666" }}
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
          Google Cloud Console →
        </a>
      </div>

      {/* YouTube Channel */}
      <div className="mb-5">
        <label className="text-xs font-medium mb-1 block" style={{ color: "var(--text-secondary)" }}>
          Chaîne YouTube
        </label>
        <input
          type="text"
          placeholder="https://youtube.com/@tachaîne"
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
          Colle l'URL de ta chaîne YouTube ou un ID de playlist
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

      {/* Save */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full py-2 rounded-lg text-xs font-medium transition-all"
        style={{
          background: saved ? "#4ade80" : "var(--accent)",
          color: saved ? "#000" : "#000",
          opacity: saving ? 0.5 : 1,
        }}
      >
        {saving ? "Sauvegarde..." : saved ? "Sauvegardé !" : "Sauvegarder"}
      </button>
    </div>
  );
}
