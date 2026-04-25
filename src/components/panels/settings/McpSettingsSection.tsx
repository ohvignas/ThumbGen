"use client";
import { useEffect, useState } from "react";

function IconBtn({
  onClick,
  disabled,
  title,
  tone = "tertiary",
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  title: string;
  tone?: "tertiary" | "ember";
  children: React.ReactNode;
}) {
  const baseColor = tone === "ember" ? "var(--ember)" : "var(--text-tertiary)";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className="p-1.5 rounded-lg transition-colors disabled:opacity-30"
      style={{ color: baseColor, border: "1px solid var(--line)" }}
      onMouseEnter={(e) => {
        if (!disabled && tone === "tertiary") e.currentTarget.style.color = "var(--text-secondary)";
      }}
      onMouseLeave={(e) => {
        if (!disabled && tone === "tertiary") e.currentTarget.style.color = "var(--text-tertiary)";
      }}
    >
      {children}
    </button>
  );
}

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
        <div
          className="text-[9px] uppercase mb-0.5"
          style={{
            color: "var(--text-muted)",
            fontFamily: "var(--font-mono), 'JetBrains Mono', monospace",
            letterSpacing: "0.22em",
          }}
        >
          <span style={{ color: "var(--brand)" }}>—</span> Intégration
        </div>
        <h3
          className="italic"
          style={{
            color: "var(--text-primary)",
            fontFamily: "var(--font-display), 'Fraunces', serif",
            fontSize: 18,
            letterSpacing: "-0.015em",
          }}
        >
          Serveur MCP
        </h3>
        <p
          className="text-[11px] mt-1"
          style={{ color: "var(--text-tertiary)", lineHeight: 1.5 }}
        >
          Expose les outils ThumbGen aux clients MCP distants (Claude Desktop, Claude Code, Cursor…).
        </p>
      </div>

      <div className="space-y-1.5">
        <label
          className="text-[10px] uppercase block"
          style={{
            color: "var(--text-muted)",
            fontFamily: "var(--font-mono), 'JetBrains Mono', monospace",
            letterSpacing: "0.18em",
          }}
        >
          Bearer token
        </label>
        <div className="flex gap-1.5 items-center">
          <code
            className="flex-1 text-[11px] px-2.5 py-2 rounded-lg truncate tabular-nums"
            style={{
              background: "var(--ink-3)",
              color: reveal ? "var(--text-secondary)" : "var(--text-muted)",
              fontFamily: "var(--font-mono), 'JetBrains Mono', monospace",
              border: "1px solid var(--line)",
              letterSpacing: reveal ? "0" : "0.15em",
            }}
            title={reveal ? key : undefined}
          >
            {reveal ? key || "(non générée)" : masked}
          </code>
          <IconBtn onClick={() => setReveal((v) => !v)} title={reveal ? "Masquer" : "Révéler"}>
            {reveal ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </IconBtn>
          <IconBtn onClick={copy} disabled={!key} title="Copier">
            {copied ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            )}
          </IconBtn>
          <IconBtn onClick={regenerate} disabled={loading} title="Régénérer" tone="ember">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
          </IconBtn>
        </div>
      </div>

      <details className="group">
        <summary
          className="cursor-pointer text-[10px] uppercase select-none flex items-center gap-1.5 transition-colors"
          style={{
            color: "var(--text-tertiary)",
            fontFamily: "var(--font-mono), 'JetBrains Mono', monospace",
            letterSpacing: "0.18em",
          }}
        >
          <span className="group-open:rotate-90 transition-transform inline-block">▸</span>
          Config Claude Desktop
        </summary>
        <div className="mt-2.5 space-y-2">
          <p className="text-[11px]" style={{ color: "var(--text-tertiary)", lineHeight: 1.5 }}>
            Ajoute ce bloc à{" "}
            <code
              className="px-1 rounded"
              style={{
                background: "var(--ink-3)",
                color: "var(--text-secondary)",
                fontFamily: "var(--font-mono), monospace",
                fontSize: 10,
              }}
            >
              ~/Library/Application Support/Claude/claude_desktop_config.json
            </code>{" "}
            (macOS) ou l&apos;équivalent sur ton système, puis redémarre Claude Desktop.
          </p>
          <pre
            className="text-[10.5px] p-2.5 rounded-lg overflow-x-auto"
            style={{
              background: "var(--ink-3)",
              color: "var(--text-secondary)",
              fontFamily: "var(--font-mono), 'JetBrains Mono', monospace",
              border: "1px solid var(--line-faint)",
              lineHeight: 1.5,
            }}
          >
            {claudeDesktopConfig}
          </pre>
          <p className="text-[11px] italic" style={{ color: "var(--text-muted)", lineHeight: 1.5 }}>
            Pour un usage à distance, expose ThumbGen via Tailscale, ngrok ou un hébergement HTTPS,
            puis remplace l&apos;URL ci-dessus.
          </p>
        </div>
      </details>
    </section>
  );
}
