"use client";

import { useState, useEffect } from "react";
import McpSettingsSection from "./settings/McpSettingsSection";
import { AGENT_MODELS, DEFAULT_AGENT_MODEL } from "@/lib/agent/models";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

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

function ApiKeyField({
  id,
  label,
  extra,
  placeholder,
  value,
  onChange,
  connected,
  connectedValue,
  helpHref,
  helpLabel,
}: {
  id: string;
  label: string;
  extra?: React.ReactNode;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  connected: boolean;
  connectedValue?: string;
  helpHref: string;
  helpLabel: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label} {extra}
      </Label>
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${connected ? "bg-primary" : "bg-muted-foreground/30"}`} />
        <span className="text-[10px] text-muted-foreground">{connected ? `Connecté (${connectedValue})` : "Non configuré"}</span>
      </div>
      <Input id={id} type="password" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
      <a href={helpHref} target="_blank" rel="noopener" className="text-[10px] text-primary block">
        {helpLabel} →
      </a>
    </div>
  );
}

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
    <div className="space-y-4">
      <ApiKeyField
        id="gemini-key"
        label="Clé API Google Gemini"
        placeholder="AIzaSy..."
        value={gemini}
        onChange={setGemini}
        connected={!!settings?.hasGemini}
        connectedValue={settings?.geminiApiKey}
        helpHref="https://aistudio.google.com/apikey"
        helpLabel="Obtenir une clé gratuite"
      />
      <ApiKeyField
        id="ideogram-key"
        label="Clé API Ideogram"
        placeholder="ide_..."
        value={ideogram}
        onChange={setIdeogram}
        connected={!!settings?.hasIdeogram}
        connectedValue={settings?.ideogramApiKey}
        helpHref="https://ideogram.ai/manage-api"
        helpLabel="Obtenir une clé"
      />
      <ApiKeyField
        id="openai-key"
        label="Clé API OpenAI"
        placeholder="sk-..."
        value={openai}
        onChange={setOpenai}
        connected={!!settings?.hasOpenai}
        connectedValue={settings?.openaiApiKey}
        helpHref="https://platform.openai.com/api-keys"
        helpLabel="Obtenir une clé"
      />
      <ApiKeyField
        id="grok-key"
        label="Clé API Grok (xAI)"
        placeholder="xai-..."
        value={grok}
        onChange={setGrok}
        connected={!!settings?.hasGrok}
        connectedValue={settings?.grokApiKey}
        helpHref="https://console.x.ai"
        helpLabel="Obtenir une clé"
      />

      <div className="space-y-3">
        <ApiKeyField
          id="openrouter-key"
          label="Clé OpenRouter"
          extra={<span className="text-primary">· agent IA</span>}
          placeholder="sk-or-v1-..."
          value={openrouter}
          onChange={setOpenrouter}
          connected={!!settings?.hasOpenrouter}
          connectedValue={settings?.openrouterApiKey}
          helpHref="https://openrouter.ai/keys"
          helpLabel="Obtenir une clé"
        />

        <div className="space-y-1.5">
          <Label>Modèle de l&apos;agent</Label>
          <Select value={agentModel || settings?.agentModel || DEFAULT_AGENT_MODEL} onValueChange={(v) => { if (v) setAgentModel(v); }}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AGENT_MODELS.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.label} — ${m.pricing.inputPerM}/${m.pricing.outputPerM} per M
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="web-search" className="text-xs font-normal">
            Recherche web automatique (variant :online)
          </Label>
          <Switch id="web-search" checked={agentWebSearch} onCheckedChange={setAgentWebSearch} />
        </div>
      </div>

      <ApiKeyField
        id="anthropic-key"
        label="Clé API Anthropic"
        extra={<span className="text-primary">· chat IA</span>}
        placeholder="sk-ant-..."
        value={anthropic}
        onChange={setAnthropic}
        connected={!!settings?.hasAnthropic}
        connectedValue={settings?.anthropicApiKey}
        helpHref="https://console.anthropic.com/settings/keys"
        helpLabel="Obtenir une clé"
      />

      <ApiKeyField
        id="youtube-key"
        label="Clé API YouTube"
        placeholder="AIzaSy..."
        value={ytKey}
        onChange={setYtKey}
        connected={!!settings?.hasYoutube}
        connectedValue={settings?.youtubeApiKey}
        helpHref="https://console.cloud.google.com/apis/credentials"
        helpLabel="Obtenir une clé"
      />

      <div className="space-y-1.5">
        <Label htmlFor="yt-channel">Chaîne YouTube</Label>
        <Input id="yt-channel" placeholder="https://youtube.com/@votrechaine" value={ytPlaylist} onChange={(e) => setYtPlaylist(e.target.value)} />
        <p className="text-[10px] text-muted-foreground">Colle l&apos;URL de ta chaîne YouTube ou un ID de playlist</p>
      </div>

      <div className="space-y-1.5">
        <Label>Langue par défaut</Label>
        <Select value={language} onValueChange={(v) => { if (v) setLanguage(v); }}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="fr">Français</SelectItem>
            <SelectItem value="en">English</SelectItem>
            <SelectItem value="es">Español</SelectItem>
            <SelectItem value="de">Deutsch</SelectItem>
            <SelectItem value="pt">Português</SelectItem>
            <SelectItem value="it">Italiano</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-[10px] text-muted-foreground">Le texte sur les miniatures sera généré dans cette langue</p>
      </div>

      <Separator />
      <McpSettingsSection />

      <Button onClick={handleSave} disabled={saving} className="w-full">
        {saving ? "Enregistrement…" : saved ? "Enregistré !" : "Enregistrer"}
      </Button>
    </div>
  );
}
