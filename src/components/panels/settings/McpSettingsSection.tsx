"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { Eye, EyeOff, Copy, Check, RefreshCw, ChevronRight } from "lucide-react";

function IconBtn({
  onClick,
  disabled,
  title,
  tone = "default",
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  title: string;
  tone?: "default" | "destructive";
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            onClick={onClick}
            disabled={disabled}
            aria-label={title}
            className={tone === "destructive" ? "text-destructive hover:text-destructive" : undefined}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent><p>{title}</p></TooltipContent>
    </Tooltip>
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
    if (!confirm("Régénérer la clé invalidera toute configuration existante de Claude Desktop ou autre client MCP. Continuer ?")) return;
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
        <h3 className="text-sm font-medium text-foreground">Serveur MCP</h3>
        <p className="text-[11px] mt-1 text-muted-foreground">
          Expose les outils ThumbGen aux clients MCP distants (Claude Desktop, Claude Code, Cursor…).
        </p>
      </div>

      <div className="space-y-1.5">
        <span className="text-[10px] uppercase text-muted-foreground block">Bearer token</span>
        <div className="flex gap-1.5 items-center">
          <code className="flex-1 text-[11px] px-2.5 py-2 rounded-lg truncate tabular-nums bg-muted font-mono border border-border" title={reveal ? key : undefined}>
            {reveal ? key || "(non générée)" : masked}
          </code>
          <IconBtn onClick={() => setReveal((v) => !v)} title={reveal ? "Masquer" : "Révéler"}>
            {reveal ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          </IconBtn>
          <IconBtn onClick={copy} disabled={!key} title="Copier">
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          </IconBtn>
          <IconBtn onClick={regenerate} disabled={loading} title="Régénérer" tone="destructive">
            <RefreshCw className="size-3.5" />
          </IconBtn>
        </div>
      </div>

      <Collapsible>
        <CollapsibleTrigger className="flex items-center gap-1.5 text-[10px] uppercase text-muted-foreground [&[data-panel-open]>svg]:rotate-90">
          <ChevronRight className="size-3 transition-transform" />
          Config Claude Desktop
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2.5 space-y-2">
          <p className="text-[11px] text-muted-foreground">
            Ajoute ce bloc à <code className="px-1 rounded bg-muted font-mono text-[10px]">~/Library/Application Support/Claude/claude_desktop_config.json</code> (macOS) ou l&apos;équivalent sur ton système, puis redémarre Claude Desktop.
          </p>
          <pre className="text-[10.5px] p-2.5 rounded-lg overflow-x-auto bg-muted font-mono border border-border leading-relaxed">{claudeDesktopConfig}</pre>
          <p className="text-[11px] italic text-muted-foreground">
            Pour un usage à distance, expose ThumbGen via Tailscale, ngrok ou un hébergement HTTPS, puis remplace l&apos;URL ci-dessus.
          </p>
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}
