"use client";
import { useEffect, useState } from "react";

type Usage = {
  today: { total: number; messages: number; generations: number };
  month: { total: number; messages: number; generations: number };
};

const REFRESH_MS = 30_000;

export default function UsageBadge() {
  const [usage, setUsage] = useState<Usage | null>(null);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const r = await fetch("/api/agent/usage");
        if (!r.ok) return;
        const data = (await r.json()) as Usage;
        if (!cancelled) setUsage(data);
      } catch {
        // silent
      }
    };
    tick();
    const id = setInterval(tick, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (!usage) return null;

  const fmt = (n: number) => `$${n.toFixed(n < 0.01 ? 4 : 2)}`;

  return (
    <div
      className="flex items-center gap-1.5 text-[10px] tabular-nums"
      style={{
        color: "var(--text-muted)",
        fontFamily: "var(--font-mono), 'JetBrains Mono', monospace",
        letterSpacing: "0.04em",
      }}
      title={`Aujourd'hui : chat ${fmt(usage.today.messages)} + générations ${fmt(usage.today.generations)}\nMois : chat ${fmt(usage.month.messages)} + générations ${fmt(usage.month.generations)}`}
    >
      <span style={{ color: "var(--text-secondary)" }}>{fmt(usage.today.total)}</span>
      <span>/</span>
      <span>{fmt(usage.month.total)}</span>
    </div>
  );
}
