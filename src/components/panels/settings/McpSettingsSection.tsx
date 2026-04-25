"use client";
import { useEffect, useState } from "react";

export default function McpSettingsSection() {
  const [key, setKey] = useState<string>("");
  const [reveal, setReveal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/settings/mcp-key")
      .then((r) => r.json())
      .then((d: { key: string }) => setKey(d.key))
      .catch(() => setKey(""));
  }, []);

  const regenerate = async () => {
    if (!confirm(
      "Régénérer la clé invalidera toute configuration existante de Claude Desktop ou autre client MCP. Continuer ?",
    )) return;
    setLoading(true);
    try {
      const r = await fetch("/api/settings/mcp-key", { method: "POST" });
      const d = (await r.json()) as { key: string };
      setKey(d.key);
      setReveal(true);
    } finally {
      setLoading(false);
    }
  };

  const copy = async () => {
    if (!key) return;
    try {
      await navigator.clipboard.writeText(key);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // older browsers / permission denied
    }
  };

  const masked = "•".repeat(40);

  const claudeDesktopConfig = `{
  "mcpServers": {
    "thumbgen": {
      "url": "http://localhost:3000/api/mcp",
      "auth": { "type": "bearer", "token": "${key || "<your-key>"}" }
    }
  }
}`;

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold mb-1">Serveur MCP</h3>
        <p className="text-xs text-gray-500">
          Expose les outils ThumbGen aux clients MCP distants (Claude Desktop, Claude Code, Cursor…).
        </p>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-gray-700">Clé d&apos;authentification (Bearer)</label>
        <div className="flex gap-1.5 items-center">
          <code
            className="flex-1 text-xs bg-gray-100 px-2 py-1.5 rounded font-mono truncate"
            title={reveal ? key : undefined}
          >
            {reveal ? key || "(non générée)" : masked}
          </code>
          <button
            onClick={() => setReveal((v) => !v)}
            className="px-2 py-1.5 text-xs border rounded hover:bg-gray-50"
            title={reveal ? "Masquer" : "Révéler"}
            aria-label={reveal ? "Masquer la clé" : "Révéler la clé"}
          >
            {reveal ? "🙈" : "👁"}
          </button>
          <button
            onClick={copy}
            disabled={!key}
            className="px-2 py-1.5 text-xs border rounded hover:bg-gray-50 disabled:opacity-50"
            title="Copier"
            aria-label="Copier la clé"
          >
            {copied ? "✓" : "📋"}
          </button>
          <button
            onClick={regenerate}
            disabled={loading}
            className="px-2 py-1.5 text-xs border rounded text-red-600 hover:bg-red-50 disabled:opacity-50"
            title="Régénérer"
            aria-label="Régénérer la clé"
          >
            ↻
          </button>
        </div>
      </div>

      <details>
        <summary className="text-xs cursor-pointer text-gray-700 hover:text-gray-900">
          Configuration Claude Desktop
        </summary>
        <div className="mt-2 space-y-1.5">
          <p className="text-xs text-gray-500">
            Ajoute ce bloc à <code className="bg-gray-100 px-1 rounded">~/Library/Application Support/Claude/claude_desktop_config.json</code> (macOS) ou
            l&apos;équivalent sur ton système, puis redémarre Claude Desktop.
          </p>
          <pre className="text-[11px] bg-gray-50 border rounded p-2 overflow-x-auto font-mono">
            {claudeDesktopConfig}
          </pre>
          <p className="text-xs text-gray-500">
            Pour un usage à distance, expose ThumbGen via Tailscale, ngrok ou en hébergement HTTPS,
            puis remplace l&apos;URL ci-dessus.
          </p>
        </div>
      </details>
    </section>
  );
}
